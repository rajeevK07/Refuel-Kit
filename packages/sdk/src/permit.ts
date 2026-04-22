// ─────────────────────────────────────────────────────
// EIP-2612 Permit Utilities
// ─────────────────────────────────────────────────────

import {
    parseSignature,
    type Address,
    type WalletClient,
    type PublicClient,
    type Hex,
} from "viem";
import type { PermitData, SignedPermit } from "./types";
import { ERC20_ABI } from "./constants";

/**
 * Build and sign an EIP-2612 permit for token approval.
 *
 * @param walletClient - Viem wallet client (connected to user)
 * @param publicClient - Viem public client
 * @param tokenAddress - ERC20 token with permit support
 * @param spender      - Contract that will be approved (RefuelSwap)
 * @param value        - Amount to approve
 * @param deadline     - Permit expiry (unix timestamp)
 *
 * @returns Signed permit data with v, r, s
 */
export async function signPermit(
    walletClient: WalletClient,
    publicClient: PublicClient,
    tokenAddress: Address,
    spender: Address,
    value: bigint,
    options?: {
        deadline?: bigint;
        version?: string;
    }
): Promise<SignedPermit> {
    const account = walletClient.account;
    if (!account) throw new Error("Wallet client must have an account");

    const owner = account.address;

    // Default deadline: 1 hour from now
    const permitDeadline =
        options?.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Get token nonce
    const nonce = await getPermitNonce(publicClient, tokenAddress, owner);

    // Get token name for domain
    const tokenName = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "name",
    });

    // Get chain ID
    const chainId = await publicClient.getChainId();

    // Build EIP-712 typed data
    const domain = {
        name: tokenName as string,
        version: options?.version ?? "1",
        chainId: BigInt(chainId),
        verifyingContract: tokenAddress,
    } as const;

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    } as const;

    const message = {
        owner,
        spender,
        value,
        nonce,
        deadline: permitDeadline,
    };

    // Sign the EIP-712 typed data
    const signature = await walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: "Permit",
        message,
    });

    // Parse v, r, s from the signature robustly (L3)
    const { r, s, v } = parseSignature(signature);

    if (!r || !s || v === undefined) {
        throw new Error("Failed to parse signature");
    }

    return {
        owner,
        spender,
        value,
        nonce,
        deadline: permitDeadline,
        v: Number(v),
        r,
        s,
    };
}

/**
 * Get the current permit nonce for a user on a token.
 */
export async function getPermitNonce(
    publicClient: PublicClient,
    tokenAddress: Address,
    owner: Address
): Promise<bigint> {
    const nonce = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "nonces",
        args: [owner],
    });
    if (typeof nonce !== "bigint" && typeof nonce !== "number" && typeof nonce !== "string") {
        throw new Error("Invalid nonce returned from token contract");
    }
    return BigInt(nonce);
}

/**
 * Check if a token supports EIP-2612 permit by probing for the nonces function.
 */
export async function supportsPermit(
    publicClient: PublicClient,
    tokenAddress: Address
): Promise<boolean> {
    try {
        await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "nonces",
            args: ["0x0000000000000000000000000000000000000001" as Address],
        });
        return true;
    } catch {
        return false;
    }
}
