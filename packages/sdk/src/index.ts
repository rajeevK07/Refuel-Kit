// ─────────────────────────────────────────────────────
// @rootstock-kits/refuel-sdk — Public API
// ─────────────────────────────────────────────────────

// Core client
export { RefuelClient } from "./RefuelClient";

// Permit utilities
export { signPermit, getPermitNonce, supportsPermit } from "./permit";

// Relay utilities
export { submitToRelay, checkRelayStatus, MockRelayer } from "./relay";

// Constants
export {
    CHAIN_CONFIGS,
    REFUEL_THRESHOLD,
    RBTC_PER_REFUEL,
    DEFAULT_TOKEN_AMOUNT,
    REFUEL_SWAP_ABI,
    ERC20_ABI,
} from "./constants";

// Types
export type {
    RootstockChainId,
    TokenSymbol,
    PermitSupport,
    TokenConfig,
    ChainConfig,
    RefuelConfig,
    BalanceStatus,
    TokenBalance,
    RefuelParams,
    PermitData,
    SignedPermit,
    RefuelRequest,
    RefuelResult,
    RefuelState,
} from "./types";
