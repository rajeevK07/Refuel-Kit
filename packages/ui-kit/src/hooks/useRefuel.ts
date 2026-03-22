// ─────────────────────────────────────────────────────
// useRefuel — State machine hook for the refuel flow
// ─────────────────────────────────────────────────────

import React, { useState, useCallback, useMemo } from "react";
import type { WalletClient, Address } from "viem";
import {
    RefuelClient,
    type RefuelConfig,
    type RefuelResult,
    type RefuelState,
    type TokenSymbol,
} from "@rootstock-kits/refuel-sdk";

export interface UseRefuelOptions {
    config: RefuelConfig;
}

export interface UseRefuelReturn {
    /** Current refuel flow state */
    state: RefuelState;
    /** Start the refuel flow */
    refuel: (token: TokenSymbol, walletClient: WalletClient) => Promise<void>;
    /** Reset state to idle */
    reset: () => void;
    /** The result if successful */
    result: RefuelResult | null;
}

export function useRefuel(options: UseRefuelOptions): UseRefuelReturn {
    const { config } = options;
    const [state, setState] = useState<RefuelState>({ step: "idle" });
    const [result, setResult] = useState<RefuelResult | null>(null);
    const client = React.useMemo(
        () => new RefuelClient(config),
        [config.chainId, config.contractAddress, config.relayerUrl, config.rpcUrl]
    );

    const refuel = useCallback(
        async (token: TokenSymbol, walletClient: WalletClient) => {
            try {
                setState({ step: "checking-balance" });

                const refuelResult = await client.refuel(
                    { token },
                    walletClient,
                    (stateStr, data) => {
                        switch (stateStr) {
                            case "checking-balance":
                                setState({ step: "checking-balance" });
                                break;
                            case "awaiting-signature":
                                setState({ step: "awaiting-signature" });
                                break;
                            case "relaying":
                                setState({ step: "relaying", message: "Submitting to relay..." });
                                break;
                            case "confirming":
                                setState({
                                    step: "confirming",
                                    txHash: data?.txHash ?? ("0x" as `0x${string}`),
                                });
                                break;
                            case "success":
                                // Will be set after this callback
                                break;
                        }
                    }
                );

                setResult(refuelResult);
                setState({ step: "success", result: refuelResult });
            } catch (err) {
                const error = err instanceof Error ? err : new Error("Refuel failed");
                setState({
                    step: "error",
                    error,
                    retryable: !error.message.includes("rejected"),
                });
            }
        },
        [client]
    );

    const reset = useCallback(() => {
        setState({ step: "idle" });
        setResult(null);
    }, []);

    return { state, refuel, reset, result };
}
