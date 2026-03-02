// ─────────────────────────────────────────────────────
// EIP-2612 Permit Utilities
// ─────────────────────────────────────────────────────

import {
    type Address,
    type WalletClient,
    type PublicClient,
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
    deadline?: bigint
): Promise<SignedPermit> {
    const account = walletClient.account;
    if (!account) throw new Error("Wallet client must have an account");

    const owner = account.address;

    // Default deadline: 1 hour from now
    const permitDeadline =
        deadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600);

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
        version: "1",
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

    // Parse v, r, s from the signature
    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(signature.slice(130, 132), 16);

    return {
        owner,
        spender,
        value,
        nonce,
        deadline: permitDeadline,
        v,
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
    return publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "nonces",
        args: [owner],
    }) as Promise<bigint>;
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
