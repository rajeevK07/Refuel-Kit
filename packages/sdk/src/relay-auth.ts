// ─────────────────────────────────────────────────────
// Relay Auth — signing the refuel request for relayer validation
// ─────────────────────────────────────────────────────

import {
    type Address,
    type WalletClient,
    type Hex,
} from "viem";
import type { RefuelRequest } from "./types";

/**
 * Sign the RefuelRequest payload to authorize the relayer.
 * This addresses M1: No relayer payload validation or signing.
 * 
 * @param walletClient - Viem wallet client
 * @param request      - The refuel request to sign
 * @param chainId      - Current chain ID
 * 
 * @returns signature (Hex)
 */
export async function signRelayRequest(
    walletClient: WalletClient,
    request: RefuelRequest,
    chainId: number
): Promise<Hex> {
    const account = walletClient.account;
    if (!account) throw new Error("Wallet client must have an account");

    const domain = {
        name: "RefuelRelayer",
        version: "1",
        chainId: BigInt(chainId),
    } as const;

    const types = {
        RefuelRelayRequest: [
            { name: "owner", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "method", type: "string" },
        ],
    } as const;

    const message = {
        owner: request.owner,
        token: request.token,
        amount: request.amount,
        method: request.method,
    };

    return walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: "RefuelRelayRequest",
        message,
    });
}
