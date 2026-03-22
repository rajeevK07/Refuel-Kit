import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { rootstockTestnet, rootstock } from "viem/chains";

export async function GET(
    req: Request,
    { params }: { params: { txHash: string } }
) {
    try {
        const txHash = params.txHash as `0x${string}`;

        // Allow deployments to choose network via env; default to testnet for safety
        const envChainId = Number(process.env.RELAYER_CHAIN_ID || "31");
        const chain = envChainId === 30 ? rootstock : rootstockTestnet;

        const publicClient = createPublicClient({
            chain,
            transport: http(),
        });

        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

        if (receipt && receipt.status === "success") {
            return NextResponse.json({
                confirmed: true,
                blockNumber: receipt.blockNumber.toString(),
            });
        }

        return NextResponse.json({ confirmed: false });
    } catch (e: any) {
        // Receipt not found yet
        return NextResponse.json({ confirmed: false });
    }
}
