/**
 * testnet-refuel.ts
 * 
 * End-to-end test script for Rootstock Testnet.
 * Mints test tokens and executes a refuel swap.
 * 
 * Usage:
 *   export PRIVATE_KEY=0x...
 *   npx ts-node packages/sdk/examples/testnet-refuel.ts
 */

import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    formatEther,
    type Address,
    type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootstockTestnet } from "viem/chains";
import { RefuelClient, CHAIN_CONFIGS } from "../src";
import type { RifRelayConfig } from "../src/types";

// Configuration
// const PRIVATE_KEY = "0x9473d60b260e191a7ccc942e6818bbfa600a5bec20f3fef1df88bca80a876a4c";
const PRIVATE_KEY = "0x00ffb46dbe3c045f932e91995b5536b9dfb57d0c2857f7e8db3c2390399c3f7f";
if (!PRIVATE_KEY) {
    console.error("Error: Please set PRIVATE_KEY environment variable.");
    process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const chainId = 31; // Testnet
const config = CHAIN_CONFIGS[chainId];

// Test Tokens
const TUSDC = config.tokens.USDC;
const TRIF = config.tokens.RIF;

const publicClient = createPublicClient({
    chain: rootstockTestnet,
    transport: http()
});

const walletClient = createWalletClient({
    account,
    chain: rootstockTestnet,
    transport: http()
});

function env(name: string): string | undefined {
    const v = process.env[name];
    return v && v.length > 0 ? v : undefined;
}

function asAddress(name: string): Address {
    const v = env(name);
    if (!v) throw new Error(`Missing env var ${name}`);
    return v as Address;
}

function asBigInt(name: string): bigint {
    const v = env(name);
    if (!v) throw new Error(`Missing env var ${name}`);
    return BigInt(v);
}

async function loadRifRelayConfig(): Promise<RifRelayConfig | undefined> {
    const relayUrl = env("RIF_RELAY_URL");
    if (!relayUrl) return undefined;

    // Helpful: pull relayHubAddress from the server if possible.
    // RIF Relay Server exposes /getaddr (see docs).
    let relayHubFromServer: Address | undefined;
    try {
        const res = await fetch(`${relayUrl.replace(/\\/$/, "")}/getaddr`);
        if (res.ok) {
            const json: any = await res.json();
            if (json?.relayHubAddress) relayHubFromServer = json.relayHubAddress as Address;
        }
    } catch {
        // ignore; we'll require env vars below
    }

    // Helpful: pull verifier list from the server if possible.
    let verifiersFromServer: Address[] | undefined;
    try {
        const res = await fetch(`${relayUrl.replace(/\\/$/, "")}/verifiers`);
        if (res.ok) {
            const json: any = await res.json();
            if (Array.isArray(json?.trustedVerifiers)) {
                verifiersFromServer = json.trustedVerifiers as Address[];
            }
        }
    } catch {
        // ignore; we'll require env vars below
    }

    // If your server returns multiple verifiers, pick the first 2 (deploy + relay),
    // or override explicitly via env vars.
    const deployVerifier =
        (env("RIF_DEPLOY_VERIFIER") as Address | undefined) ??
        verifiersFromServer?.[0];
    const relayVerifier =
        (env("RIF_RELAY_VERIFIER") as Address | undefined) ??
        verifiersFromServer?.[1] ??
        verifiersFromServer?.[0];

    if (!deployVerifier || !relayVerifier) {
        throw new Error(
            "Could not determine verifier addresses. Set RIF_DEPLOY_VERIFIER and RIF_RELAY_VERIFIER, or ensure /verifiers works on your relay server."
        );
    }

    return {
        preferredRelays: [relayUrl],
        relayHubAddress: (env("RIF_RELAY_HUB") as Address | undefined) ?? (relayHubFromServer ?? asAddress("RIF_RELAY_HUB")),
        deployVerifierAddress: deployVerifier,
        relayVerifierAddress: relayVerifier,
        smartWalletFactoryAddress: asAddress("RIF_SMART_WALLET_FACTORY"),
        callForwarder: asAddress("RIF_CALL_FORWARDER"),
        feeToken: asAddress("RIF_FEE_TOKEN"),
        maxFeeTokenAmount: asBigInt("RIF_MAX_FEE_TOKEN_AMOUNT"),
    };
}

async function mintMockTokens(token: { address: Address, decimals: number, symbol: string }) {
    console.log(`\n--- Attempting to acquire 100 ${token.symbol} ---`);
    const amount = parseEther("100"); // 100 tokens (18 decimals for testnet mock)

    // Try multiple common minting / faucet signatures
    const possibleSigs = [
        { name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], args: [account.address, amount] },
        { name: 'mint', inputs: [{ name: 'amount', type: 'uint256' }], args: [amount] },
        { name: 'faucet', inputs: [], args: [] }
    ];

    for (const sig of possibleSigs) {
        try {
            console.log(`Trying ${sig.name}(${sig.args.map(a => typeof a === 'string' ? a.slice(0, 10) + '...' : a).join(', ')})...`);
            const { request } = await publicClient.simulateContract({
                account,
                address: token.address,
                abi: [{
                    type: 'function',
                    name: sig.name,
                    inputs: sig.inputs,
                    outputs: []
                }],
                functionName: sig.name,
                args: sig.args as any
            });

            const hash = await walletClient.writeContract(request);
            console.log(`TX Hash: ${hash}`);
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`Successfully acquired ${token.symbol}!`);
            return; // Success!
        } catch (error) {
            // Silently try next signature
        }
    }
    console.error(`❌ Could not acquire ${token.symbol}. Please use a testnet faucet for ${token.address}`);
}

async function runTest() {
    console.log(`Account: ${account.address}`);

    const rbtcBalance = await publicClient.getBalance({ address: account.address });
    console.log(`RBTC Balance: ${formatEther(rbtcBalance)} RBTC`);

    // 1. Mint tokens first
    await mintMockTokens(TUSDC);
    await mintMockTokens(TRIF);

    // 2. Initialize Refuel SDK
    const rifRelay = await loadRifRelayConfig();
    const refuelClient = new RefuelClient({
        chainId: 31,
        // Optional: override contract address if needed
        // contractAddress: "0x..." 
        ...(rifRelay ? { rifRelay } : {}),
    });
    console.log(rifRelay ? "\nUsing RIF Relay SDK mode (rifRelay configured)." : "\nUsing non-RIF relay mode (no rifRelay config).");

    // 3. Check refueling status
    console.log("\n--- Checking Balance Status ---");
    const status = await refuelClient.checkBalance(account.address);
    console.log(`Needs Refuel: ${status.needsRefuel}`);
    console.log("Token Balances:");
    status.tokenBalances.forEach(tb => {
        const bal = Number(tb.balance) / Math.pow(10, tb.token.decimals);
        console.log(` - ${tb.token.symbol}: ${bal} (Can Refuel: ${tb.canRefuel})`);
    });

    if (!status.needsRefuel) {
        console.log("\nBalance is above threshold, but we'll force a refuel for testing...");
    }

    // 4. Perform Refuel (using USDC as example)
    const tokenToPay = "USDC";
    console.log(`\n--- Initiating Refuel with ${tokenToPay} ---`);

    try {
        await refuelClient.refuel(
            { token: tokenToPay as any },
            walletClient as any,
            (step: string, data?: any) => {
                console.log(`Step: ${step}`, data ? `(Data: ${JSON.stringify(data)})` : "");
            }
        );
        console.log("\n✅ Refuel Successful!");
    } catch (error) {
        console.error("\n❌ Refuel Failed:", (error as Error).message);
    }
}

runTest().catch(console.error);
