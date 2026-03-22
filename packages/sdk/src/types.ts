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
    /** EIP-712 domain version (e.g. "1" or "2") */
    domainVersion?: string;
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
    /**
     * Optional RIF Relay configuration.
     *
     * When provided, the SDK can envelop the RefuelSwap call via `@rsksmart/rif-relay-sdk`
     * and submit it to a RIF Relay Server, instead of using the kit's lightweight `/api/refuel` relayer.
     */
    rifRelay?: RifRelayConfig;
}

/**
 * Minimal configuration required to use RIF Relay's Enveloping flow.
 * Addresses are expected to be deployed for the selected network.
 */
export interface RifRelayConfig {
    /** Array of relay server URLs (e.g. ["https://relay.testnet.rootstock.io"]) */
    preferredRelays: string[];
    relayHubAddress: Address;
    deployVerifierAddress: Address;
    relayVerifierAddress: Address;
    smartWalletFactoryAddress: Address;
    /**
     * Smart Wallet address that will forward the sponsored call.
     * This must already exist / be deployed for `from`.
     */
    callForwarder: Address;
    /**
     * Token used to pay relaying fees (or the "gas token" configured on the relay stack).
     * This is independent of the token being swapped by RefuelSwap.
     */
    feeToken: Address;
    /** Max fee in `feeToken` wei (token decimals) */
    maxFeeTokenAmount: bigint;
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
    /** Signature for the relay request itself (M1) */
    signature?: Hex;
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
