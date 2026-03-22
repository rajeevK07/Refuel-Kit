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
/** Thrown when the relay server requires token approval before proceeding */
export class NeedsApprovalError extends Error {
    public readonly spenderAddress: string;
    public readonly requiredAmount: string;
    constructor(spenderAddress: string, requiredAmount: string) {
        super(`Token approval required. Approve ${requiredAmount} tokens to spender ${spenderAddress}`);
        this.name = "NeedsApprovalError";
        this.spenderAddress = spenderAddress;
        this.requiredAmount = requiredAmount;
    }
}

export async function submitToRelay(
    relayerUrl: string,
    request: RefuelRequest,
    chainId: number
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
        signature: request.signature,
        chainId,
    };

    const response = await fetch(`${relayerUrl}/api/refuel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        // Try to parse structured error from relay backend
        try {
            const errorData = await response.json();
            if (errorData.needsApproval) {
                throw new NeedsApprovalError(
                    errorData.spenderAddress,
                    errorData.requiredAmount
                );
            }
            throw new Error(errorData.error || `Relay server error (${response.status})`);
        } catch (e) {
            if (e instanceof NeedsApprovalError) throw e;
            throw new Error(`Relay server error (${response.status})`);
        }
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

