import type { Address, Hash } from "viem";
import { encodeFunctionData } from "viem";
import { CHAIN_CONFIGS, REFUEL_SWAP_ABI } from "./constants";
import type { RefuelRequest, RifRelayConfig } from "./types";

function toHashLike(value: any): Hash {
    if (typeof value === "string" && value.startsWith("0x") && value.length === 66) {
        return value as Hash;
    }
    throw new Error("RIF Relay SDK did not return a transaction hash");
}

/**
 * Submit the RefuelSwap call through RIF Relay (Enveloping).
 *
 * This uses `@rsksmart/rif-relay-sdk` to envelop a transaction and forward
 * it to a RIF Relay Server. The RIF Relay stack (hub, verifiers, smart wallet,
 * and server) must already be deployed and configured.
 *
 * ## Prerequisites
 *
 * 1. **Deploy RIF Relay contracts** on your target network.
 *    See: https://dev.rootstock.io/developers/integrate/rif-relay/deployment/
 *
 * 2. **Whitelist tokens** on the verifiers:
 *    `npx hardhat allow-tokens --network testnet --token-list <TOKEN_ADDRESSES>`
 *
 * 3. **Run & register a RIF Relay Server**:
 *    See: https://github.com/rsksmart/rif-relay-server
 *
 * 4. **Install peer dependencies** in your project:
 *    `npm install @rsksmart/rif-relay-sdk web3`
 *
 * ## Usage
 *
 * ```ts
 * import { submitToRifRelay } from "@rootstock-kits/refuel-sdk";
 * import { RIF_RELAY_TESTNET_ADDRESSES } from "@rootstock-kits/refuel-sdk";
 *
 * const txHash = await submitToRifRelay(
 *   {
 *     preferredRelays: ["https://your-relay-server.example.com"],
 *     relayHubAddress: RIF_RELAY_TESTNET_ADDRESSES.relayHubAddress,
 *     deployVerifierAddress: RIF_RELAY_TESTNET_ADDRESSES.deployVerifierAddress,
 *     relayVerifierAddress: RIF_RELAY_TESTNET_ADDRESSES.relayVerifierAddress,
 *     smartWalletFactoryAddress: "0x...", // your deployed factory
 *     callForwarder: "0x...", // user's smart wallet
 *     feeToken: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe", // tRIF
 *     maxFeeTokenAmount: 50_000_000_000_000_000_000n,
 *   },
 *   31, // testnet
 *   refuelSwapAddress,
 *   request
 * );
 * ```
 */
export async function submitToRifRelay(
    config: RifRelayConfig,
    chainId: 30 | 31,
    refuelSwapAddress: Address,
    request: RefuelRequest
): Promise<Hash> {
    const chain = CHAIN_CONFIGS[chainId];
    if (!chain) throw new Error(`Unsupported chain ID for RIF Relay: ${chainId}`);

    if (request.method === "permit" && !request.permit) {
        throw new Error("Permit data required for permit method");
    }

    const data =
        request.method === "permit"
            ? encodeFunctionData({
                abi: REFUEL_SWAP_ABI,
                functionName: "refuelWithPermitFor",
                args: [
                    request.owner,
                    request.token,
                    request.amount,
                    BigInt(request.permit!.deadline),
                    request.permit!.v,
                    request.permit!.r,
                    request.permit!.s,
                ],
            })
            : encodeFunctionData({
                abi: REFUEL_SWAP_ABI,
                functionName: "refuelWithAllowanceFor",
                args: [request.owner, request.token, request.amount],
            });

    // Dynamic import: @rsksmart/rif-relay-sdk and web3 are optional peer deps
    let rifRelaySdk: any;
    try {
        rifRelaySdk = await import("@rsksmart/rif-relay-sdk");
    } catch {
        throw new Error(
            "Could not import @rsksmart/rif-relay-sdk. " +
            "Install it as a dependency: npm install @rsksmart/rif-relay-sdk web3"
        );
    }

    const {
        RelayClient,
        setEnvelopingConfig,
        setProvider,
    } = rifRelaySdk;

    if (!RelayClient || !setEnvelopingConfig || !setProvider) {
        throw new Error(
            "Installed @rsksmart/rif-relay-sdk does not expose expected APIs " +
            "(RelayClient, setEnvelopingConfig, setProvider). " +
            "Check your SDK version — expected >=1.0.0-alpha.4."
        );
    }

    let Web3: any;
    try {
        const web3Pkg: any = await import("web3");
        Web3 = web3Pkg.default ?? web3Pkg;
    } catch {
        throw new Error(
            "Could not import web3. " +
            "Install it as a dependency: npm install web3"
        );
    }

    const web3 = new Web3(chain.rpcUrl);

    setEnvelopingConfig({
        chainId,
        preferredRelays: config.preferredRelays,
        relayHubAddress: config.relayHubAddress,
        deployVerifierAddress: config.deployVerifierAddress,
        relayVerifierAddress: config.relayVerifierAddress,
        smartWalletFactoryAddress: config.smartWalletFactoryAddress,
    });
    setProvider(web3.currentProvider);

    const relayClient = new RelayClient();

    const relayTransactionOpts = {
        request: {
            from: request.owner,
            to: refuelSwapAddress,
            data,
            tokenContract: config.feeToken,
            tokenAmount: config.maxFeeTokenAmount.toString(),
        },
        relayData: {
            callForwarder: config.callForwarder,
        },
    };

    const tx: any = await relayClient.relayTransaction(relayTransactionOpts);

    // Different versions return different shapes; accept common fields.
    return (
        (tx?.hash && toHashLike(tx.hash)) ||
        (tx?.transactionHash && toHashLike(tx.transactionHash)) ||
        (typeof tx === "string" ? toHashLike(tx) : toHashLike(tx?.txHash))
    );
}
