// ─────────────────────────────────────────────────────
// RefuelClient — Main SDK entry point
// ─────────────────────────────────────────────────────

import {
    createPublicClient,
    http,
    formatEther,
    type Address,
    type PublicClient,
    type WalletClient,
    type Hash,
} from "viem";

import type {
    RefuelConfig,
    BalanceStatus,
    TokenBalance,
    RefuelParams,
    RefuelRequest,
    RefuelResult,
    ChainConfig,
    TokenConfig,
} from "./types";

import {
    CHAIN_CONFIGS,
    REFUEL_THRESHOLD,
    ERC20_ABI,
    REFUEL_SWAP_ABI,
} from "./constants";

import { signPermit } from "./permit";
import { submitToRelay, MockRelayer } from "./relay";

/**
 * RefuelClient — The main interface for the Rootstock Refuel SDK.
 *
 * @example
 * ```ts
 * import { RefuelClient } from "@rootstock-kits/refuel-sdk";
 *
 * const client = new RefuelClient({ chainId: 31 });
 *
 * // Check if user needs gas
 * const status = await client.checkBalance("0x...");
 *
 * // One-shot refuel (build + sign + submit)
 * const result = await client.refuel(
 *   { token: "USDC" },
 *   walletClient
 * );
 * ```
 */
export class RefuelClient {
    private publicClient: PublicClient;
    private chainConfig: ChainConfig;
    private relayerUrl: string;
    private contractAddress: Address;
    private useMockRelay: boolean;
    private mockRelayer?: MockRelayer;

    constructor(config: RefuelConfig) {
        const chainConfig = CHAIN_CONFIGS[config.chainId];
        if (!chainConfig) {
            throw new Error(
                `Unsupported chain ID: ${config.chainId}. Use 30 (mainnet) or 31 (testnet).`
            );
        }

        this.chainConfig = chainConfig;
        this.contractAddress =
            config.contractAddress ?? chainConfig.refuelSwapAddress;
        this.relayerUrl = config.relayerUrl ?? "";
        this.useMockRelay = !config.relayerUrl;

        if (this.useMockRelay) {
            this.mockRelayer = new MockRelayer();
        }

        this.publicClient = createPublicClient({
            transport: http(config.rpcUrl ?? chainConfig.rpcUrl),
        });
    }

    // ─── Balance Check ──────────────────────────────

    /**
     * Check the user's RBTC and token balances to determine if they need refueling.
     */
    async checkBalance(address: Address): Promise<BalanceStatus> {
        // Get RBTC balance
        const rbtcBalance = await this.publicClient.getBalance({
            address,
        });

        const needsRefuel = rbtcBalance < REFUEL_THRESHOLD;

        // Get balances for all supported tokens (resilient — one failure doesn't crash all)
        const tokenBalances: TokenBalance[] = await Promise.all(
            Object.values(this.chainConfig.tokens).map(async (token) => {
                try {
                    const balance = (await this.publicClient.readContract({
                        address: token.address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [address],
                    })) as bigint;

                    return {
                        token,
                        balance,
                        canRefuel: balance >= token.refuelAmount,
                    };
                } catch (err) {
                    // Token contract may not exist on this network or may be invalid
                    console.warn(
                        `[RefuelSDK] Failed to fetch ${token.symbol} balance at ${token.address}:`,
                        err instanceof Error ? err.message : err
                    );
                    return {
                        token,
                        balance: 0n,
                        canRefuel: false,
                    };
                }
            })
        );

        return {
            rbtcBalance,
            needsRefuel,
            tokenBalances,
        };
    }

    // ─── Build Refuel Request ───────────────────────

    /**
     * Build a refuel request (unsigned). The caller must then sign it.
     */
    async buildRefuelRequest(
        address: Address,
        params: RefuelParams
    ): Promise<{ request: RefuelRequest; tokenConfig: TokenConfig }> {
        const tokenConfig = this.chainConfig.tokens[params.token];
        if (!tokenConfig) {
            throw new Error(`Token ${params.token} is not supported on chain ${this.chainConfig.chainId}`);
        }

        const amount = params.amount ?? tokenConfig.refuelAmount;

        return {
            request: {
                owner: address,
                token: tokenConfig.address,
                amount,
                method: tokenConfig.permitSupport === "eip2612" ? "permit" : "allowance",
            },
            tokenConfig,
        };
    }

    // ─── Full Refuel Flow ───────────────────────────

    /**
     * One-shot refuel: build request → sign permit → submit to relay.
     *
     * Emits state updates via the optional `onStateChange` callback.
     */
    async refuel(
        params: RefuelParams,
        walletClient: WalletClient,
        onStateChange?: (state: string) => void
    ): Promise<RefuelResult> {
        const account = walletClient.account;
        if (!account) throw new Error("Wallet client must have an account");

        const address = account.address;

        // 1. Build request
        onStateChange?.("checking-balance");
        const { request, tokenConfig } = await this.buildRefuelRequest(
            address,
            params
        );

        // 2. Sign permit (if supported)
        if (request.method === "permit") {
            onStateChange?.("awaiting-signature");

            const signedPermit = await signPermit(
                walletClient,
                this.publicClient,
                tokenConfig.address,
                this.contractAddress,
                request.amount,
                params.deadline
            );

            request.permit = signedPermit;
        }

        // 3. Submit to relay
        onStateChange?.("relaying");

        if (this.useMockRelay && this.mockRelayer) {
            // Use mock relayer for demo
            const result = await this.mockRelayer.submitRefuel(request);
            onStateChange?.("success");
            return result;
        }

        // Real relay
        const txHash = await submitToRelay(this.relayerUrl, request);

        onStateChange?.("confirming");

        // 4. Wait for confirmation
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });

        const result: RefuelResult = {
            txHash,
            rbtcReceived: this.chainConfig.rbtcPerRefuel,
            tokenSpent: request.amount,
            blockNumber: receipt.blockNumber,
            status: receipt.status === "success" ? "success" : "reverted",
        };

        onStateChange?.(result.status);
        return result;
    }

    // ─── Getters ────────────────────────────────────

    /** Get the quote for a refuel swap */
    async getQuote(token: Address, amount: bigint): Promise<bigint> {
        return (await this.publicClient.readContract({
            address: this.contractAddress,
            abi: REFUEL_SWAP_ABI,
            functionName: "getQuote",
            args: [token, amount],
        })) as bigint;
    }

    /** Get the available RBTC liquidity in the contract */
    async getAvailableLiquidity(): Promise<bigint> {
        return (await this.publicClient.readContract({
            address: this.contractAddress,
            abi: REFUEL_SWAP_ABI,
            functionName: "availableLiquidity",
        })) as bigint;
    }

    /** Get the chain config */
    getChainConfig(): ChainConfig {
        return this.chainConfig;
    }

    /** Get supported token configs */
    getSupportedTokens(): TokenConfig[] {
        return Object.values(this.chainConfig.tokens);
    }

    /** Format a wei amount to human-readable RBTC */
    static formatRbtc(wei: bigint): string {
        return formatEther(wei);
    }
}
