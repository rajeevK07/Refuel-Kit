// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {RefuelSwap} from "../src/RefuelSwap.sol";
import {IRefuelSwap} from "../src/interfaces/IRefuelSwap.sol";
import {ERC20Permit, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Mock ERC20 with permit support for testing
contract MockPermitToken is ERC20Permit {
    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mock ERC20 WITHOUT permit support (simulates RIF/ERC677)
contract MockBasicToken is ERC20 {
    constructor() ERC20("Mock RIF", "mRIF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RefuelSwapTest is Test {
    RefuelSwap public refuel;
    MockPermitToken public permitToken;
    MockBasicToken public basicToken;

    address public owner;
    uint256 public ownerKey;
    address public user;
    uint256 public userKey;
    address public relayer;

    uint256 constant TOKEN_AMOUNT = 5 ether;
    uint256 constant RBTC_AMOUNT = 0.001 ether;
    uint256 constant INITIAL_LIQUIDITY = 1 ether;

    function setUp() public {
        // Create accounts
        (owner, ownerKey) = makeAddrAndKey("owner");
        (user, userKey) = makeAddrAndKey("user");
        relayer = makeAddr("relayer");

        // Fund accounts
        vm.deal(owner, 10 ether);
        vm.deal(relayer, 1 ether);

        // Deploy contracts
        vm.startPrank(owner);
        refuel = new RefuelSwap(owner);
        permitToken = new MockPermitToken();
        basicToken = new MockBasicToken();

        // Configure tokens
        refuel.configureToken(address(permitToken), TOKEN_AMOUNT, RBTC_AMOUNT);
        refuel.configureToken(address(basicToken), TOKEN_AMOUNT, RBTC_AMOUNT);

        // Configure relayer
        refuel.setRelayer(relayer, true);

        // Deposit RBTC liquidity
        refuel.depositLiquidity{value: INITIAL_LIQUIDITY}();
        vm.stopPrank();

        // Mint tokens to user
        permitToken.mint(user, 100 ether);
        basicToken.mint(user, 100 ether);
    }

    // ─── Permit Path Tests ───────────────────────────

    function test_RefuelWithPermit_DirectCall() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            user,
            userKey,
            address(permitToken),
            address(refuel),
            TOKEN_AMOUNT,
            deadline
        );

        uint256 userRbtcBefore = user.balance;

        vm.prank(user);
        refuel.refuelWithPermit(
            address(permitToken),
            TOKEN_AMOUNT,
            deadline,
            v,
            r,
            s
        );

        assertEq(
            user.balance - userRbtcBefore,
            RBTC_AMOUNT,
            "User should receive RBTC"
        );
        assertEq(
            permitToken.balanceOf(address(refuel)),
            TOKEN_AMOUNT,
            "Contract should hold tokens"
        );
    }

    function test_RefuelWithPermitFor_RelayerCall() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(
            user,
            userKey,
            address(permitToken),
            address(refuel),
            TOKEN_AMOUNT,
            deadline
        );

        uint256 userRbtcBefore = user.balance;

        // Relayer executes on behalf of the user
        vm.prank(relayer);
        refuel.refuelWithPermitFor(
            user,
            address(permitToken),
            TOKEN_AMOUNT,
            deadline,
            v,
            r,
            s
        );

        assertEq(
            user.balance - userRbtcBefore,
            RBTC_AMOUNT,
            "User should receive RBTC via relayer"
        );
    }

    // ─── Allowance Path Tests ────────────────────────

    function test_RefuelWithAllowance_DirectCall() public {
        vm.startPrank(user);
        basicToken.approve(address(refuel), TOKEN_AMOUNT);

        uint256 userRbtcBefore = user.balance;
        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        vm.stopPrank();

        assertEq(
            user.balance - userRbtcBefore,
            RBTC_AMOUNT,
            "User should receive RBTC"
        );
    }

    function test_RefuelWithAllowanceFor_RelayerCall() public {
        // User approves the contract (this would be relayed in practice)
        vm.prank(user);
        basicToken.approve(address(refuel), TOKEN_AMOUNT);

        uint256 userRbtcBefore = user.balance;

        // Relayer calls on behalf
        vm.prank(relayer);
        refuel.refuelWithAllowanceFor(user, address(basicToken), TOKEN_AMOUNT);

        assertEq(
            user.balance - userRbtcBefore,
            RBTC_AMOUNT,
            "User should receive RBTC via relayer"
        );
    }

    // ─── Error Cases ─────────────────────────────────

    function test_RevertWhen_TokenNotSupported() public {
        address fakeToken = makeAddr("fakeToken");

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRefuelSwap.TokenNotSupported.selector,
                fakeToken
            )
        );
        refuel.refuelWithAllowance(fakeToken, TOKEN_AMOUNT);
    }

    function test_RevertWhen_InsufficientLiquidity() public {
        // Drain liquidity
        vm.prank(owner);
        refuel.withdrawRbtc(INITIAL_LIQUIDITY);

        vm.startPrank(user);
        basicToken.approve(address(refuel), TOKEN_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                IRefuelSwap.InsufficientRbtcLiquidity.selector,
                RBTC_AMOUNT,
                0
            )
        );
        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        vm.stopPrank();
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(IRefuelSwap.InvalidAmount.selector);
        refuel.refuelWithAllowance(address(basicToken), 0);
    }

    function test_RevertWhen_ZeroAddressOwner() public {
        vm.prank(relayer);
        vm.expectRevert(IRefuelSwap.ZeroAddress.selector);
        refuel.refuelWithAllowanceFor(
            address(0),
            address(basicToken),
            TOKEN_AMOUNT
        );
    }

    // ─── View Function Tests ─────────────────────────

    function test_GetQuote() public view {
        uint256 quote = refuel.getQuote(address(permitToken), TOKEN_AMOUNT);
        assertEq(quote, RBTC_AMOUNT, "Quote should match configured rate");
    }

    function test_GetQuote_HalfAmount() public view {
        uint256 halfAmount = TOKEN_AMOUNT / 2;
        uint256 quote = refuel.getQuote(address(permitToken), halfAmount);
        assertEq(quote, RBTC_AMOUNT / 2, "Half amount should give half RBTC");
    }

    function test_IsTokenSupported() public {
        assertTrue(refuel.isTokenSupported(address(permitToken)));
        assertFalse(refuel.isTokenSupported(makeAddr("random")));
    }

    function test_AvailableLiquidity() public view {
        assertEq(refuel.availableLiquidity(), INITIAL_LIQUIDITY);
    }

    // ─── Admin Tests ─────────────────────────────────

    function test_ConfigureToken_OnlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        refuel.configureToken(makeAddr("newToken"), 1 ether, 0.001 ether);
    }

    function test_DisableToken() public {
        vm.prank(owner);
        refuel.disableToken(address(permitToken));
        assertFalse(refuel.isTokenSupported(address(permitToken)));
    }

    function test_WithdrawTokens() public {
        // First do a swap to get tokens in the contract
        vm.startPrank(user);
        basicToken.approve(address(refuel), TOKEN_AMOUNT);
        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        vm.stopPrank();

        uint256 ownerBalBefore = basicToken.balanceOf(owner);
        vm.prank(owner);
        refuel.withdrawTokens(address(basicToken), TOKEN_AMOUNT);
        assertEq(
            basicToken.balanceOf(owner) - ownerBalBefore,
            TOKEN_AMOUNT,
            "Owner should receive tokens"
        );
    }

    function test_WithdrawRbtc() public {
        uint256 ownerBalBefore = owner.balance;
        vm.prank(owner);
        refuel.withdrawRbtc(0.5 ether);
        assertEq(owner.balance - ownerBalBefore, 0.5 ether);
    }

    // ─── Event Tests ─────────────────────────────────

    function test_EmitRefueled() public {
        vm.startPrank(user);
        basicToken.approve(address(refuel), TOKEN_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit IRefuelSwap.Refueled(
            user,
            address(basicToken),
            TOKEN_AMOUNT,
            RBTC_AMOUNT
        );

        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        vm.stopPrank();
    }

    // ─── Helpers ─────────────────────────────────────

    function _signPermit(
        address _owner,
        uint256 _ownerKey,
        address _token,
        address _spender,
        uint256 _value,
        uint256 _deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        MockPermitToken token = MockPermitToken(_token);

        bytes32 domainSeparator = token.DOMAIN_SEPARATOR();
        uint256 nonce = token.nonces(_owner);

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                _owner,
                _spender,
                _value,
                nonce,
                _deadline
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );

        (v, r, s) = vm.sign(_ownerKey, digest);
    }

    // ─── L7: Fuzz and Edge Case Tests ─────────────

    function testFuzz_RefuelWithAllowance(uint256 amount) public {
        // reasonable bounds
        vm.assume(amount > 0 && amount < 100_000 ether);
        
        // Ensure contract has liquidity to pay
        uint256 expectedRbtcOut = (amount * RBTC_AMOUNT) / TOKEN_AMOUNT;
        vm.assume(expectedRbtcOut <= INITIAL_LIQUIDITY);

        basicToken.mint(user, amount);

        vm.startPrank(user);
        basicToken.approve(address(refuel), amount);
        
        uint256 userRbtcBefore = user.balance;
        refuel.refuelWithAllowance(address(basicToken), amount);
        vm.stopPrank();

        assertEq(user.balance - userRbtcBefore, expectedRbtcOut, "User should receive RBTC");
    }

    function test_SequentialSwapsRateLimit() public {
        vm.startPrank(user);
        basicToken.approve(address(refuel), TOKEN_AMOUNT * 2);
        
        // First swap succeeds
        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        
        // Second swap reverts immediately due to rate limit (L4)
        vm.expectRevert(IRefuelSwap.RateLimitExceeded.selector);
        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        
        // Advance time by 1 hour + 1 second
        skip(3601);
        
        // Third swap succeeds after cooldown
        refuel.refuelWithAllowance(address(basicToken), TOKEN_AMOUNT);
        vm.stopPrank();
    }

    function test_ReceiveOnlyOwner() public {
        vm.deal(makeAddr("randomDude"), 1 ether);
        vm.startPrank(makeAddr("randomDude"));
        
        // Use low level call since receive is payable
        (bool success, ) = address(refuel).call{value: 1 ether}("");
        assertFalse(success, "Random user should not be able to deposit via receive");
        
        vm.stopPrank();
    }
}
