// ─────────────────────────────────────────────────────
// Types for @rootstock-kits/refuel-sdk
// ─────────────────────────────────────────────────────

import type { Address, Hash, Hex } from "viem";

/** Supported Rootstock chain IDs */
export type RootstockChainId = 30 | 31;

/** Token identifiers */
export type TokenSymbol = "RIF" | "USDC";

/** Whether the token supports EIP-2612 permit */
export type PermitSupport = "eip2612" | "legacy-approve";

/** Token configuration */
export interface TokenConfig {
    symbol: TokenSymbol;
    address: Address;
    decimals: number;
    permitSupport: PermitSupport;
    /** Token amount required per refuel swap */
    refuelAmount: bigint;
}

/** Chain-specific configuration */
export interface ChainConfig {
    chainId: RootstockChainId;
    name: string;
    rpcUrl: string;
    blockExplorerUrl: string;
    refuelSwapAddress: Address;
    tokens: Record<TokenSymbol, TokenConfig>;
    /** RBTC amount returned per refuel swap */
    rbtcPerRefuel: bigint;
}

/** SDK initialization config */
export interface RefuelConfig {
    chainId: RootstockChainId;
    /** Override the default relay server URL */
    relayerUrl?: string;
    /** Override the RefuelSwap contract address */
    contractAddress?: Address;
    /** Custom RPC URL */
    rpcUrl?: string;
}

/** User's balance status */
export interface BalanceStatus {
    /** RBTC balance in wei */
    rbtcBalance: bigint;
    /** Whether the RBTC balance is below the refuel threshold */
    needsRefuel: boolean;
    /** Token balances that can be used for refueling */
    tokenBalances: TokenBalance[];
}

export interface TokenBalance {
    token: TokenConfig;
    balance: bigint;
    /** Whether the user has enough tokens to refuel */
    canRefuel: boolean;
}

/** Parameters to initiate a refuel */
export interface RefuelParams {
    /** The token to swap for RBTC */
    token: TokenSymbol;
    /** Override default token amount (optional) */
    amount?: bigint;
    /** Permit deadline in unix timestamp (defaults to 1 hour from now) */
    deadline?: bigint;
}

/** EIP-2612 Permit data */
export interface PermitData {
    owner: Address;
    spender: Address;
    value: bigint;
    nonce: bigint;
    deadline: bigint;
}

/** Signed permit */
export interface SignedPermit extends PermitData {
    v: number;
    r: Hex;
    s: Hex;
}

/** The full refuel request ready for relay */
export interface RefuelRequest {
    /** User's address */
    owner: Address;
    /** Token contract address */
    token: Address;
    /** Token amount to swap */
    amount: bigint;
    /** The permit type (determines contract method) */
    method: "permit" | "allowance";
    /** Signed permit data (only for method=permit) */
    permit?: SignedPermit;
}

/** Result of a refuel operation */
export interface RefuelResult {
    /** Transaction hash */
    txHash: Hash;
    /** RBTC amount received */
    rbtcReceived: bigint;
    /** Token amount spent */
    tokenSpent: bigint;
    /** Block number */
    blockNumber: bigint;
    /** Status */
    status: "success" | "reverted";
}

/** State machine for the refuel flow */
export type RefuelState =
    | { step: "idle" }
    | { step: "checking-balance" }
    | { step: "awaiting-signature" }
    | { step: "relaying"; message: string }
    | { step: "confirming"; txHash: Hash }
    | { step: "success"; result: RefuelResult }
    | { step: "error"; error: Error; retryable: boolean };
