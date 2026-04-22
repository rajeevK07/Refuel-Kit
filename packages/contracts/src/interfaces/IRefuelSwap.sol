// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IRefuelSwap
 * @notice Interface for the Rootstock Refuel emergency swap contract.
 * @dev Enables gasless token-to-RBTC swaps using EIP-2612 Permit signatures.
 */
interface IRefuelSwap {
    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a user successfully refuels (swaps token → RBTC).
    event Refueled(
        address indexed user,
        address indexed token,
        uint256 tokenAmount,
        uint256 rbtcAmount
    );

    /// @notice Emitted when a new token is whitelisted with a swap rate.
    event TokenConfigured(
        address indexed token,
        uint256 tokenAmount,
        uint256 rbtcAmount
    );

    /// @notice Emitted when RBTC liquidity is deposited by the owner.
    event LiquidityDeposited(address indexed depositor, uint256 amount);

    /// @notice Emitted when the owner withdraws collected tokens.
    event TokensWithdrawn(address indexed token, uint256 amount);

    /// @notice Emitted when the owner withdraws RBTC.
    event RbtcWithdrawn(uint256 amount);

    /// @notice Emitted when a relayer is added or removed.
    event RelayerConfigured(address indexed relayer, bool status);

    /// @notice Emitted when a user withdraws pending RBTC.
    event PendingRbtcWithdrawn(address indexed user, uint256 amount);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error TokenNotSupported(address token);
    error InsufficientRbtcLiquidity(uint256 required, uint256 available);
    error InsufficientTokenBalance(uint256 required, uint256 available);
    error InvalidAmount();
    error TransferFailed();
    error ZeroAddress();
    error Unauthorized();
    error RateLimitExceeded();
    error PermitExpired();

    // ──────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Swap tokens for RBTC using an EIP-2612 permit signature.
     * @param token  The ERC20 token address to swap from.
     * @param amount The amount of tokens to swap.
     * @param deadline  The permit signature deadline.
     * @param v  Signature v component.
     * @param r  Signature r component.
     * @param s  Signature s component.
     */
    function refuelWithPermit(
        address token,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Swap tokens for RBTC using a pre-existing allowance.
     * @dev Fallback for tokens that don't support EIP-2612 (e.g., RIF/ERC677).
     * @param token  The ERC20 token address to swap from.
     * @param amount The amount of tokens to swap.
     */
    function refuelWithAllowance(address token, uint256 amount) external;

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Get the RBTC amount a user would receive for a given token swap.
     * @param token  The token address.
     * @param amount The token amount.
     * @return rbtcOut The RBTC the user would receive.
     */
    function getQuote(
        address token,
        uint256 amount
    ) external view returns (uint256 rbtcOut);

    /**
     * @notice Check if a token is supported for refueling.
     */
    function isTokenSupported(address token) external view returns (bool);

    /**
     * @notice Get available RBTC liquidity in the contract.
     */
    function availableLiquidity() external view returns (uint256);
}
