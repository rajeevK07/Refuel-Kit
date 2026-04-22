/**
 * setup-relayer.ts
 *
 * One-time admin script to:
 * 1. Whitelist the relayer wallet address in the deployed RefuelSwap contract
 * 2. Check the current contract state (liquidity, tokens, etc.)
 *
 * Usage:
 *   # Set the PRIVATE_KEY of the CONTRACT OWNER (deployer)
 *   PRIVATE_KEY=0x<owner-key> npx tsx packages/sdk/examples/setup-relayer.ts
 */

import {
    createPublicClient,
    createWalletClient,
    http,
    type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootstockTestnet } from "viem/chains";
import { CHAIN_CONFIGS } from "../dist/index.js";

const OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!OWNER_PRIVATE_KEY) {
    console.error("Error: Please set PRIVATE_KEY environment variable.");
    process.exit(1);
}

// The RELAYER wallet address used in the Next.js API route (api/refuel/route.ts)
// This is the address derived from the key used in the backend relayer
const RELAYER_ADDRESS_TO_WHITELIST = "0x4E7fA7958e7F63508409E0045FE61D495d09D6FD" as Address;

const chainId = 31;
const config = CHAIN_CONFIGS[chainId];

const REFUEL_SWAP_ADMIN_ABI = [
    {
        type: "function",
        name: "setRelayer",
        inputs: [
            { name: "relayer", type: "address" },
            { name: "status", type: "bool" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "isRelayer",
        inputs: [{ name: "addr", type: "address" }],
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
        type: "function",
        name: "isTokenSupported",
        inputs: [{ name: "token", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "depositLiquidity",
        inputs: [],
        outputs: [],
        stateMutability: "payable",
    },
] as const;

async function main() {
    const owner = privateKeyToAccount(OWNER_PRIVATE_KEY);

    console.log("Owner wallet:", owner.address);
    console.log("Contract:    ", config.refuelSwapAddress);
    console.log("Relayer to whitelist:", RELAYER_ADDRESS_TO_WHITELIST);

    const publicClient = createPublicClient({
        chain: rootstockTestnet,
        transport: http(),
    });

    const walletClient = createWalletClient({
        account: owner,
        chain: rootstockTestnet,
        transport: http(),
    });

    // ─── 1. Check current state ────────────────────────────────────────────────

    const [liquidity, rifSupported, usdcSupported, isRelayerNow] = await Promise.all([
        publicClient.readContract({
            address: config.refuelSwapAddress!,
            abi: REFUEL_SWAP_ADMIN_ABI,
            functionName: "availableLiquidity",
        }),
        publicClient.readContract({
            address: config.refuelSwapAddress!,
            abi: REFUEL_SWAP_ADMIN_ABI,
            functionName: "isTokenSupported",
            args: [config.tokens.RIF.address],
        }),
        publicClient.readContract({
            address: config.refuelSwapAddress!,
            abi: REFUEL_SWAP_ADMIN_ABI,
            functionName: "isTokenSupported",
            args: [config.tokens.USDC.address],
        }),
        publicClient.readContract({
            address: config.refuelSwapAddress!,
            abi: REFUEL_SWAP_ADMIN_ABI,
            functionName: "isRelayer",
            args: [RELAYER_ADDRESS_TO_WHITELIST],
        }),
    ]);

    console.log("\n─── Contract State ───────────────────────");
    console.log(`RBTC Liquidity: ${Number(liquidity) / 1e18} RBTC`);
    console.log(`RIF supported:  ${rifSupported}`);
    console.log(`USDC supported: ${usdcSupported}`);
    console.log(`Relayer already registered: ${isRelayerNow}`);

    // ─── 2. Whitelist relayer if not already ──────────────────────────────────
    if (!isRelayerNow) {
        console.log("\n─── Whitelisting Relayer ─────────────────");
        const { request } = await publicClient.simulateContract({
            account: owner,
            address: config.refuelSwapAddress!,
            abi: REFUEL_SWAP_ADMIN_ABI,
            functionName: "setRelayer",
            args: [RELAYER_ADDRESS_TO_WHITELIST, true],
        });
        const hash = await walletClient.writeContract(request);
        console.log("TX submitted:", hash);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log("✅ Relayer whitelisted successfully!");
    } else {
        console.log("✅ Relayer is already whitelisted. Nothing to do.");
    }

    // ─── 3. Deposit liquidity if needed ───────────────────────────────────────
    if (liquidity === 0n) {
        console.log("\n─── Depositing RBTC Liquidity ─────────────");
        const ownerBalance = await publicClient.getBalance({ address: owner.address });
        const depositAmount = ownerBalance > 5_000_000_000_000_000n // 0.005 RBTC
            ? 2_000_000_000_000_000n // deposit 0.002 RBTC
            : 0n;

        if (depositAmount > 0n) {
            const hash = await walletClient.writeContract({
                address: config.refuelSwapAddress!,
                abi: REFUEL_SWAP_ADMIN_ABI,
                functionName: "depositLiquidity",
                value: depositAmount,
            });
            console.log("TX submitted:", hash);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`✅ Deposited ${Number(depositAmount) / 1e18} RBTC liquidity!`);
        } else {
            console.log("⚠️  Owner doesn't have enough RBTC to deposit liquidity. Fund the owner wallet first!");
        }
    }

    console.log("\n✅ Setup complete! The relayer backend is now ready.");
}

main().catch(console.error);
