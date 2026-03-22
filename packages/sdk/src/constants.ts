// ─────────────────────────────────────────────────────
// Constants & Configuration for Rootstock Refuel SDK
// ─────────────────────────────────────────────────────

import type { Address } from "viem";
import type { ChainConfig, TokenConfig, RootstockChainId } from "./types";

// ─── RBTC Threshold ──────────────────────────────────

/** Balance threshold below which a user "needs refuel" (0.0001 RBTC) */
export const REFUEL_THRESHOLD = 100_000_000_000_000n; // 0.0001 ether in wei

/** Default RBTC amount returned per refuel (0.001 RBTC) */
export const RBTC_PER_REFUEL = 1_000_000_000_000_000n; // 0.001 ether in wei

/** Default token amount required per refuel (5 tokens, 18 decimals)
 *  Based on contract rate: 5 tokens = 0.001 RBTC
 */
export const DEFAULT_TOKEN_AMOUNT = 5_000_000_000_000_000_000n; // 5e18


// ─── Token Configs ───────────────────────────────────

const RIF_MAINNET: TokenConfig = {
    symbol: "RIF",
    address: "0x2acc95758f8b5f583470ba265eb685a8f45fc9d5" as Address,
    decimals: 18,
    permitSupport: "legacy-approve", // RIF is ERC677, no permit
    refuelAmount: DEFAULT_TOKEN_AMOUNT,
};

const USDC_MAINNET: TokenConfig = {
    symbol: "USDC",
    address: "0xbb739a6e04d07b08e38b66ba137d0c9cd270c750" as Address,
    decimals: 6, // Circle USDC uses 6 decimals
    permitSupport: "eip2612", // USDC supports EIP-2612
    refuelAmount: 5_000_000n, // 5 USDC (6 decimals)
    domainVersion: "2",
};

const RIF_TESTNET: TokenConfig = {
    symbol: "RIF",
    address: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe" as Address,
    decimals: 18,
    permitSupport: "legacy-approve",
    refuelAmount: 5_000_000_000_000_000_000n, // 5 RIF → 0.001 RBTC at deployed rate
};

const USDC_TESTNET: TokenConfig = {
    symbol: "USDC",
    address: "0x6491A87c4a710c0cE79E60aEC0B1C3e847F4C852" as Address,
    decimals: 18, // Rootstock Testnet mock USDC uses 18 decimals
    permitSupport: "eip2612", // Now points to our custom MockPermitToken
    domainVersion: "1",
    refuelAmount: 5_000_000_000_000_000_000n, // 5 USDC equiv → 0.001 RBTC at deployed rate
};

// ─── Chain Configs ───────────────────────────────────

export const CHAIN_CONFIGS: Record<RootstockChainId, ChainConfig> = {
    30: {
        chainId: 30,
        name: "Rootstock Mainnet",
        rpcUrl: "https://public-node.rsk.co",
        blockExplorerUrl: "https://rootstock.blockscout.com",
        refuelSwapAddress: "0x1111111111111111111111111111111111111111" as Address, // Placeholder until mainnet deployment
        tokens: {
            RIF: RIF_MAINNET,
            USDC: USDC_MAINNET,
        },
        rbtcPerRefuel: RBTC_PER_REFUEL,
    },
    31: {
        chainId: 31,
        name: "Rootstock Testnet",
        rpcUrl: "https://public-node.testnet.rsk.co",
        blockExplorerUrl: "https://rootstock-testnet.blockscout.com",
        refuelSwapAddress: "0xecb2f47fd664f0376562f2a3b3748b2b4c6f40a7" as Address,
        tokens: {
            RIF: RIF_TESTNET,
            USDC: USDC_TESTNET,
        },
        rbtcPerRefuel: RBTC_PER_REFUEL,
    },
};

// ─── RIF Relay Contract Addresses ────────────────────
// Official RIF Relay V1 contracts deployed on Rootstock.
// Source: https://dev.rootstock.io/developers/integrate/rif-relay/contracts/
//
// To deploy your own: see docs/RIF_RELAY_SETUP.md
// To use an existing deployment: pass these addresses to RefuelConfig.rifRelay

export const RIF_RELAY_TESTNET_ADDRESSES = {
    relayHubAddress: "0xAd525463961399793f8716b0D85133ff7503a7C2" as Address,
    relayVerifierAddress: "0xB86c972Ff212838C4c396199B27a0DBe45560df8" as Address,
    deployVerifierAddress: "0xc67f193Bb1D64F13FD49E2da6586a2F417e56b16" as Address,
    /** SmartWalletFactory must be set by the operator after deployment */
    smartWalletFactoryAddress: undefined as Address | undefined,
} as const;

export const RIF_RELAY_MAINNET_ADDRESSES = {
    /** Operators must deploy their own RIF Relay infrastructure on mainnet */
    relayHubAddress: undefined as Address | undefined,
    relayVerifierAddress: undefined as Address | undefined,
    deployVerifierAddress: undefined as Address | undefined,
    smartWalletFactoryAddress: undefined as Address | undefined,
} as const;

// ─── ABI (RefuelSwap) ────────────────────────────────

export const REFUEL_SWAP_ABI = [
    {
        type: "function",
        name: "refuelWithPermit",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "v", type: "uint8" },
            { name: "r", type: "bytes32" },
            { name: "s", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "refuelWithPermitFor",
        inputs: [
            { name: "owner", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "v", type: "uint8" },
            { name: "r", type: "bytes32" },
            { name: "s", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "refuelWithAllowance",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "refuelWithAllowanceFor",
        inputs: [
            { name: "owner", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getQuote",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "rbtcOut", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "isTokenSupported",
        inputs: [{ name: "token", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "availableLiquidity",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "Refueled",
        inputs: [
            { name: "user", type: "address", indexed: true },
            { name: "token", type: "address", indexed: true },
            { name: "tokenAmount", type: "uint256", indexed: false },
            { name: "rbtcAmount", type: "uint256", indexed: false },
        ],
    },
] as const;

// ─── ERC20 ABI (subset) ─────────────────────────────

export const ERC20_ABI = [
    {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "allowance",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "approve",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "nonces",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "name",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "DOMAIN_SEPARATOR",
        inputs: [],
        outputs: [{ name: "", type: "bytes32" }],
        stateMutability: "view",
    },
] as const;
