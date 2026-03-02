// ─────────────────────────────────────────────────────
// Relay Layer — communication with the relayer server
// ─────────────────────────────────────────────────────

import type { Address, Hash, Hex } from "viem";
import type { RefuelRequest, RefuelResult } from "./types";

/** Relay server response */
interface RelayResponse {
    success: boolean;
    txHash?: Hash;
    error?: string;
}

/**
 * Submit a signed refuel request to the relay server.
 *
 * The relay server will:
 * 1. Validate the request
 * 2. Call RefuelSwap.refuelWithPermitFor() or refuelWithAllowanceFor()
 * 3. Pay the gas in RBTC
 * 4. Return the transaction hash
 */
export async function submitToRelay(
    relayerUrl: string,
    request: RefuelRequest
): Promise<Hash> {
    const payload = {
        owner: request.owner,
        token: request.token,
        amount: request.amount.toString(),
        method: request.method,
        permit: request.permit
            ? {
                deadline: request.permit.deadline.toString(),
                v: request.permit.v,
                r: request.permit.r,
                s: request.permit.s,
            }
            : undefined,
    };

    const response = await fetch(`${relayerUrl}/api/refuel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Relay server error (${response.status}): ${errorBody}`);
    }

    const data: RelayResponse = await response.json();

    if (!data.success || !data.txHash) {
        throw new Error(data.error || "Relay server returned an unknown error");
    }

    return data.txHash;
}

/**
 * Poll for transaction confirmation from the relay.
 */
export async function checkRelayStatus(
    relayerUrl: string,
    txHash: Hash
): Promise<{ confirmed: boolean; blockNumber?: bigint }> {
    const response = await fetch(
        `${relayerUrl}/api/status/${txHash}`
    );

    if (!response.ok) {
        return { confirmed: false };
    }

    const data = await response.json();
    return {
        confirmed: data.confirmed ?? false,
        blockNumber: data.blockNumber ? BigInt(data.blockNumber) : undefined,
    };
}

// ─────────────────────────────────────────────────────
// Mock Relayer — for development and demo purposes
// ─────────────────────────────────────────────────────

/**
 * A mock relay server that simulates the relay flow.
 * Used in the demo app when no real relay infrastructure is available.
 *
 * Simulates:
 * - 1s delay for "relaying"
 * - 2s delay for "confirming"
 * - Returns a fake but valid-looking tx hash
 */
export class MockRelayer {
    private delay: number;

    constructor(delayMs: number = 2000) {
        this.delay = delayMs;
    }

    async submitRefuel(request: RefuelRequest): Promise<RefuelResult> {
        // Simulate relay delay
        await this._sleep(this.delay);

        // Generate a deterministic-looking tx hash (valid 32-byte hex)
        const mockHash = `0x${"ab".repeat(32)}` as Hash;

        // Simulate confirmation delay
        await this._sleep(this.delay / 2);

        return {
            txHash: mockHash,
            rbtcReceived: 1_000_000_000_000_000n, // 0.001 RBTC
            tokenSpent: request.amount,
            blockNumber: BigInt(Math.floor(Math.random() * 10_000_000)),
            status: "success",
        };
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
