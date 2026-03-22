import { createPublicClient, http, type Address } from "viem";
import { rootstockTestnet } from "viem/chains";

async function probe() {
    const client = createPublicClient({
        chain: rootstockTestnet,
        transport: http()
    });

    const tokens: Address[] = [
        "0x166844b69f20dd7c609b81cca603fe81f19c54b9", // USDC
        "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe"  // RIF
    ];

    for (const addr of tokens) {
        console.log(`\n--- Probing ${addr} ---`);
        try {
            const name = await client.readContract({
                address: addr,
                abi: [{ type: "function", name: "name", inputs: [], outputs: [{ type: "string" }] }],
                functionName: "name"
            });
            console.log(`Name: ${name}`);

            const symbol = await client.readContract({
                address: addr,
                abi: [{ type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }] }],
                functionName: "symbol"
            });
            console.log(`Symbol: ${symbol}`);

            const decimals = await client.readContract({
                address: addr,
                abi: [{ type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }] }],
                functionName: "decimals"
            });
            console.log(`Decimals: ${decimals}`);

            // Check nonces
            try {
                await client.readContract({
                    address: addr,
                    abi: [{ type: "function", name: "nonces", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
                    functionName: "nonces",
                    args: ["0x4E7fA7958e7F63508409E0045FE61D495d09D6FD"]
                });
                console.log(`Permit Support: YES (nonces exists)`);
            } catch {
                console.log(`Permit Support: NO (nonces reverted/not found)`);
            }
        } catch (e) {
            console.error(`Failed to probe ${addr}:`, (e as Error).message);
        }
    }
}

probe();
