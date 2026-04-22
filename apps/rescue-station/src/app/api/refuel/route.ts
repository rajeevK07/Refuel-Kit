import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootstockTestnet, rootstock } from "viem/chains";
import { REFUEL_SWAP_ABI, CHAIN_CONFIGS } from "@rootstock-kits/refuel-sdk";

const ERC20_ALLOWANCE_ABI = [
    {
        type: "function",
        name: "allowance",
        inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
] as const;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { owner, token, amount, method, permit, signature, chainId: bodyChainId } = body;

        if (!owner || !token || !amount || !method) {
            return NextResponse.json(
                { success: false, error: "Missing required fields in request body" },
                { status: 400 }
            );
        }

        // Resolve chainId (default to testnet if omitted, but allow explicit mainnet)
        const chainId = bodyChainId === 30 ? 30 : 31;
        const chain = chainId === 30 ? rootstock : rootstockTestnet;
        const config = CHAIN_CONFIGS[chainId as 30 | 31];

        // Verify the user-signed relay request (EIP-712) if a signature is provided
        if (!signature) {
            return NextResponse.json(
                { success: false, error: "Missing relay request signature" },
                { status: 400 }
            );
        }

        const verified = await verifyTypedData({
            address: owner as `0x${string}`,
            signature: signature as `0x${string}`,
            domain: {
                name: "RefuelRelayer",
                version: "1",
                chainId,
                verifyingContract: config.refuelSwapAddress,
            },
            types: {
                RefuelRelayRequest: [
                    { name: "owner", type: "address" },
                    { name: "token", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "method", type: "string" },
                ],
            },
            primaryType: "RefuelRelayRequest",
            message: {
                owner,
                token,
                amount: BigInt(amount),
                method,
            },
        });

        if (!verified) {
            return NextResponse.json(
                { success: false, error: "Invalid relay request signature" },
                { status: 401 }
            );
        }

        const rawKey = process.env.RELAYER_PRIVATE_KEY;
        if (!rawKey) {
            console.error("[Relayer] RELAYER_PRIVATE_KEY is not configured");
            return NextResponse.json(
                { success: false, error: "Relayer misconfigured" },
                { status: 500 }
            );
        }

        const pk = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
        const account = privateKeyToAccount(pk as `0x${string}`);

        // KEY ROTATION PROCEDURE:
        // 1. Generate a new private key and derive its address.
        // 2. Call `setRelayer(newAddress, true)` on the RefuelSwap contract from the owner account.
        // 3. Update the RELAYER_PRIVATE_KEY environment variable in the production deployment.
        // 4. Restart the service to load the new key.
        // 5. Call `setRelayer(oldAddress, false)` from the owner account to revoke the old key.

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Relayer] Account: ${account.address} | Chain: ${chainId} | Method: ${method}`);
        }

        const publicClient = createPublicClient({ chain, transport: http() });
        const walletClient = createWalletClient({ account, chain, transport: http() });

        let txHash: `0x${string}`;

        if (method === "permit" && permit) {
            // EIP-2612 path: user signed a permit, relayer submits + swaps in one tx
            if (process.env.NODE_ENV !== 'production') console.log("[Relayer] Executing refuelWithPermitFor");
            txHash = await walletClient.writeContract({
                address: config.refuelSwapAddress,
                abi: REFUEL_SWAP_ABI,
                functionName: "refuelWithPermitFor",
                args: [
                    owner as `0x${string}`,
                    token as `0x${string}`,
                    BigInt(amount),
                    BigInt(permit.deadline),
                    permit.v as number,
                    permit.r as `0x${string}`,
                    permit.s as `0x${string}`,
                ],
            });
        } else {
            // Legacy-approve path: user approved the contract beforehand
            if (process.env.NODE_ENV !== 'production') console.log("[Relayer] Executing refuelWithAllowanceFor");

            // Check allowance first
            const currentAllowance = await publicClient.readContract({
                address: token as `0x${string}`,
                abi: ERC20_ALLOWANCE_ABI,
                functionName: "allowance",
                args: [owner as `0x${string}`, config.refuelSwapAddress],
            });

            if (currentAllowance < BigInt(amount)) {
                return NextResponse.json(
                    {
                        success: false,
                        needsApproval: true,
                        error: `Insufficient allowance. Please approve at least ${amount} tokens. Current: ${currentAllowance}`,
                        spenderAddress: config.refuelSwapAddress,
                        requiredAmount: amount,
                    },
                    { status: 400 }
                );
            }

            txHash = await walletClient.writeContract({
                address: config.refuelSwapAddress,
                abi: REFUEL_SWAP_ABI,
                functionName: "refuelWithAllowanceFor",
                args: [owner as `0x${string}`, token as `0x${string}`, BigInt(amount)],
            });
        }

        if (process.env.NODE_ENV !== 'production') console.log(`[Relayer] TX submitted: ${txHash}`);
        return NextResponse.json({ success: true, txHash });
    } catch (e: any) {
        const msg = e.shortMessage || e.details || e.message || "Unknown error";
        console.error("[Relayer] Error:", msg);
        return NextResponse.json(
            { success: false, error: msg },
            { status: 500 }
        );
    }
}
