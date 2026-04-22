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
import { submitToRelay } from "./relay";
import { signRelayRequest } from "./relay-auth";
import { submitToRifRelay } from "./rif-relay";

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
    private rifRelayConfig?: RefuelConfig["rifRelay"];
    private contractAddress?: Address;

    constructor(config: RefuelConfig) {
        const chainConfig = CHAIN_CONFIGS[config.chainId];
        if (!chainConfig) {
            throw new Error(
                `Unsupported chain ID: ${config.chainId}. Use 30 (mainnet) or 31 (testnet).`
            );
        }

        this.chainConfig = chainConfig;
        this.contractAddress = config.contractAddress ?? chainConfig.refuelSwapAddress;
        this.relayerUrl = config.relayerUrl ?? "";
        this.rifRelayConfig = config.rifRelay;

        if (!this.rifRelayConfig && !this.relayerUrl) {
            throw new Error(
                "No relay configured. Provide rifRelay config (recommended) or a relayerUrl. " +
                "See docs/RIF_RELAY_SETUP.md for deployment instructions."
            );
        }

        this.publicClient = createPublicClient({
            transport: http(config.rpcUrl ?? chainConfig.rpcUrl),
            batch: { multicall: true },
        });
    }

    private ensureContractAddress(): Address {
        if (
            !this.contractAddress ||
            this.contractAddress === "0x0000000000000000000000000000000000000000"
        ) {
            throw new Error(
                `RefuelSwap contract is not yet deployed on chain ${this.chainConfig.chainId}. Provide a valid custom contractAddress.`
            );
        }
        return this.contractAddress;
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
        onStateChange?: (state: string, data?: any) => void
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

            const contractAddress = this.ensureContractAddress();
            const signedPermit = await signPermit(
                walletClient,
                this.publicClient,
                tokenConfig.address,
                contractAddress,
                request.amount,
                {
                    deadline: params.deadline,
                    version: tokenConfig.domainVersion,
                }
            );

            request.permit = signedPermit;
        }

        // 3. Sign the relay request itself (M1)
        onStateChange?.("awaiting-signature");
        const contractAddress = this.ensureContractAddress();
        request.signature = await signRelayRequest(
            walletClient,
            request,
            this.chainConfig.chainId,
            contractAddress
        );

        // 4. Submit to relay
        onStateChange?.("relaying");

        // Preferred: RIF Relay (if configured)
        if (this.rifRelayConfig) {
            const contractAddress = this.ensureContractAddress();
            const txHash = await submitToRifRelay(
                this.rifRelayConfig,
                this.chainConfig.chainId,
                contractAddress,
                request
            );
            onStateChange?.("confirming", { txHash });
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
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

        // Custom HTTP relay fallback
        const txHash = await submitToRelay(
            this.relayerUrl,
            request,
            this.chainConfig.chainId
        );
        onStateChange?.("confirming", { txHash });

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
        const contractAddress = this.ensureContractAddress();
        return (await this.publicClient.readContract({
            address: contractAddress,
            abi: REFUEL_SWAP_ABI,
            functionName: "getQuote",
            args: [token, amount],
        })) as bigint;
    }

    /** Get the available RBTC liquidity in the contract */
    async getAvailableLiquidity(): Promise<bigint> {
        const contractAddress = this.ensureContractAddress();
        return (await this.publicClient.readContract({
            address: contractAddress,
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
