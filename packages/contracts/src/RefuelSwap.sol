// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRefuelSwap} from "./interfaces/IRefuelSwap.sol";

/**
 * @title RefuelSwap
 * @author Rootstock Kits
 * @notice Emergency "gas station" contract for Rootstock.
 *
 *  Users who have ERC20 tokens (USDC, RIF) on Rootstock but no RBTC for gas
 *  can swap a fixed amount of tokens for a small amount of RBTC. The swap
 *  uses EIP-2612 `permit` for gasless approval, enabling a relayer to
 *  execute the entire flow on the user's behalf.
 *
 *  Flow:
 *    1. User signs an EIP-712 permit off-chain (no gas).
 *    2. Relayer calls `refuelWithPermit()` on-chain.
 *    3. Contract calls `token.permit()` to set allowance.
 *    4. Contract calls `token.transferFrom()` to pull tokens.
 *    5. Contract sends RBTC to the user.
 *
 *  For tokens without EIP-2612 support (e.g. RIF/ERC677), use
 *  `refuelWithAllowance()` after approval is relayed separately.
 */
contract RefuelSwap is IRefuelSwap, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    struct SwapRate {
        uint256 tokenAmount; // e.g. 5 * 1e18  (5 tokens)
        uint256 rbtcAmount; // e.g. 1e15       (0.001 RBTC)
        bool enabled;
    }

    /// @notice token address → swap rate configuration
    mapping(address => SwapRate) public swapRates;

    /// @notice List of supported token addresses (for enumeration)
    address[] public supportedTokens;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ──────────────────────────────────────────────
    //  Receive RBTC (liquidity deposits)
    // ──────────────────────────────────────────────

    receive() external payable {
        emit LiquidityDeposited(msg.sender, msg.value);
    }

    // ──────────────────────────────────────────────
    //  Core: Refuel with Permit (EIP-2612)
    // ──────────────────────────────────────────────

    /// @inheritdoc IRefuelSwap
    function refuelWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override nonReentrant {
        // In a relayed tx, msg.sender is the relayer — not the user.
        // We recover the true owner from the permit signature.
        // The permit itself cryptographically proves the owner authorized this spend.

        // We need the owner address — extract from permit's ecrecover.
        // However, the standard pattern is to pass owner explicitly and let
        // the token's permit() verify the signature. We accept owner as the
        // tx originator for direct calls, or as a parameter for relayed calls.
        // For simplicity and compatibility, we use a separate overloaded entry.

        // Direct user call path (user IS msg.sender)
        _refuelPermitInternal(msg.sender, token, amount, deadline, v, r, s);
    }

    /**
     * @notice Relayer-callable version: swap tokens for RBTC on behalf of a user.
     * @param owner  The token owner who signed the permit.
     * @param token  The ERC20 token address to swap from.
     * @param amount The amount of tokens to swap.
     * @param deadline  The permit signature deadline.
     * @param v  Signature v component.
     * @param r  Signature r component.
     * @param s  Signature s component.
     */
    function refuelWithPermitFor(
        address owner,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (owner == address(0)) revert ZeroAddress();
        _refuelPermitInternal(owner, token, amount, deadline, v, r, s);
    }

    function _refuelPermitInternal(
        address owner,
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        // 1. Validate
        SwapRate memory rate = _validateSwap(token, amount);

        // 2. Execute permit (set allowance from user → this contract)
        IERC20Permit(token).permit(
            owner, // owner
            address(this), // spender
            amount, // value
            deadline,
            v,
            r,
            s
        );

        // 3. Execute swap
        _executeSwap(owner, token, amount, rate);
    }

    // ──────────────────────────────────────────────
    //  Core: Refuel with pre-existing Allowance
    // ──────────────────────────────────────────────

    /// @inheritdoc IRefuelSwap
    function refuelWithAllowance(
        address token,
        uint256 amount
    ) external override nonReentrant {
        // 1. Validate
        SwapRate memory rate = _validateSwap(token, amount);

        // 2. Execute swap (allowance must already be set)
        _executeSwap(msg.sender, token, amount, rate);
    }

    /**
     * @notice Relayer-callable version: refuel with pre-existing allowance on behalf of user.
     */
    function refuelWithAllowanceFor(
        address owner,
        address token,
        uint256 amount
    ) external nonReentrant {
        if (owner == address(0)) revert ZeroAddress();
        SwapRate memory rate = _validateSwap(token, amount);
        _executeSwap(owner, token, amount, rate);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IRefuelSwap
    function getQuote(
        address token,
        uint256 amount
    ) external view override returns (uint256 rbtcOut) {
        SwapRate memory rate = swapRates[token];
        if (!rate.enabled) revert TokenNotSupported(token);
        if (amount == 0) revert InvalidAmount();

        // Linear scaling: rbtcOut = (amount / tokenAmount) * rbtcAmount
        rbtcOut = (amount * rate.rbtcAmount) / rate.tokenAmount;
    }

    /// @inheritdoc IRefuelSwap
    function isTokenSupported(
        address token
    ) external view override returns (bool) {
        return swapRates[token].enabled;
    }

    /// @inheritdoc IRefuelSwap
    function availableLiquidity() external view override returns (uint256) {
        return address(this).balance;
    }

    /// @notice Get all supported token addresses.
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    // ──────────────────────────────────────────────
    //  Admin Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Configure a token's swap rate or add a new supported token.
     * @param token       The ERC20 token address.
     * @param tokenAmount The amount of tokens required for a swap.
     * @param rbtcAmount  The amount of RBTC to send per swap.
     */
    function configureToken(
        address token,
        uint256 tokenAmount,
        uint256 rbtcAmount
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (tokenAmount == 0 || rbtcAmount == 0) revert InvalidAmount();

        bool isNew = !swapRates[token].enabled;

        swapRates[token] = SwapRate({
            tokenAmount: tokenAmount,
            rbtcAmount: rbtcAmount,
            enabled: true
        });

        if (isNew) {
            supportedTokens.push(token);
        }

        emit TokenConfigured(token, tokenAmount, rbtcAmount);
    }

    /**
     * @notice Disable a token from being used for refueling.
     */
    function disableToken(address token) external onlyOwner {
        swapRates[token].enabled = false;
    }

    /**
     * @notice Deposit RBTC liquidity into the contract.
     */
    function depositLiquidity() external payable onlyOwner {
        if (msg.value == 0) revert InvalidAmount();
        emit LiquidityDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw collected ERC20 tokens (fees/revenue).
     */
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();
        IERC20(token).safeTransfer(msg.sender, amount);
        emit TokensWithdrawn(token, amount);
    }

    /**
     * @notice Withdraw RBTC from the contract.
     */
    function withdrawRbtc(uint256 amount) external onlyOwner {
        if (amount == 0 || amount > address(this).balance)
            revert InvalidAmount();

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit RbtcWithdrawn(amount);
    }

    // ──────────────────────────────────────────────
    //  Internal Helpers
    // ──────────────────────────────────────────────

    function _validateSwap(
        address token,
        uint256 amount
    ) internal view returns (SwapRate memory rate) {
        rate = swapRates[token];

        if (!rate.enabled) revert TokenNotSupported(token);
        if (amount == 0) revert InvalidAmount();

        // Calculate RBTC to send
        uint256 rbtcOut = (amount * rate.rbtcAmount) / rate.tokenAmount;
        if (rbtcOut > address(this).balance) {
            revert InsufficientRbtcLiquidity(rbtcOut, address(this).balance);
        }
    }

    function _executeSwap(
        address owner,
        address token,
        uint256 amount,
        SwapRate memory rate
    ) internal {
        // 1. Pull tokens from the user
        IERC20(token).safeTransferFrom(owner, address(this), amount);

        // 2. Calculate and send RBTC
        uint256 rbtcOut = (amount * rate.rbtcAmount) / rate.tokenAmount;

        (bool success, ) = owner.call{value: rbtcOut}("");
        if (!success) revert TransferFailed();

        emit Refueled(owner, token, amount, rbtcOut);
    }
}
