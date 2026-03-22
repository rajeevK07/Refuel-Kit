import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefuelClient } from "../RefuelClient";
import { CHAIN_CONFIGS } from "../constants";

// Mock viem
vi.mock("viem", async () => {
    const actual = await vi.importActual<typeof import("viem")>("viem");
    return {
        ...actual,
        createPublicClient: vi.fn(() => ({
            getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
            readContract: vi.fn().mockResolvedValue(5000000n),
            getChainId: vi.fn().mockResolvedValue(31),
        })),
        http: vi.fn(),
    };
});

describe("RefuelClient", () => {
    let client: RefuelClient;

    beforeEach(() => {
        client = new RefuelClient({ chainId: 31 });
    });

    it("initializes correctly for testnet", () => {
        expect(client.getChainConfig().chainId).toBe(31);
        expect(client.getSupportedTokens().length).toBeGreaterThan(0);
    });

    it("throws for unsupported chain ID", () => {
        expect(() => new RefuelClient({ chainId: 1 as any })).toThrow(
            "Unsupported chain ID"
        );
    });

    it("throws if mainnet contract address is missing/zero", () => {
        const originalMainnet = CHAIN_CONFIGS[30];
        (CHAIN_CONFIGS as any)[30] = {
            ...originalMainnet,
            refuelSwapAddress:
                "0x0000000000000000000000000000000000000000",
        };

        expect(() => new RefuelClient({ chainId: 30 })).toThrow(
            "RefuelSwap contract is not yet deployed"
        );

        (CHAIN_CONFIGS as any)[30] = originalMainnet;
    });

    it("builds a valid refuel request for USDC testnet (allowance path)", async () => {
        const { request } = await client.buildRefuelRequest("0x123", {
            token: "USDC",
        });
        expect(request.owner).toBe("0x123");
        expect(request.token).toBe(CHAIN_CONFIGS[31].tokens.USDC.address);
        expect(request.amount).toBe(
            CHAIN_CONFIGS[31].tokens.USDC.refuelAmount
        );
        expect(request.method).toBe("allowance");
    });
});
