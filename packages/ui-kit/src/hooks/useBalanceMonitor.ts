// ─────────────────────────────────────────────────────
// useBalanceMonitor — Polls RBTC balance and detects low-gas
// ─────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import type { Address } from "viem";
import { RefuelClient, type BalanceStatus, type RefuelConfig } from "@rootstock-kits/refuel-sdk";

export interface UseBalanceMonitorOptions {
    /** User's wallet address */
    address?: Address;
    /** SDK config */
    config: RefuelConfig;
    /** Polling interval in ms (default: 15000) */
    pollInterval?: number;
    /** Whether polling is enabled (default: true) */
    enabled?: boolean;
}

export interface UseBalanceMonitorReturn {
    /** Current balance status */
    status: BalanceStatus | null;
    /** Whether the balance check is loading */
    isLoading: boolean;
    /** Error if the balance check failed */
    error: Error | null;
    /** Manually refresh the balance */
    refresh: () => Promise<void>;
}

export function useBalanceMonitor(
    options: UseBalanceMonitorOptions
): UseBalanceMonitorReturn {
    const { address, config, pollInterval = 15000, enabled = true } = options;

    const [status, setStatus] = useState<BalanceStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const clientRef = useRef<RefuelClient | null>(null);

    // Initialize client
    useEffect(() => {
        clientRef.current = new RefuelClient(config);
    }, [config.chainId, config.rpcUrl, config.contractAddress]);

    const refresh = useCallback(async () => {
        if (!address || !clientRef.current) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await clientRef.current.checkBalance(address);
            setStatus(result);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Balance check failed"));
        } finally {
            setIsLoading(false);
        }
    }, [address]);

    // Initial fetch + polling
    useEffect(() => {
        if (!enabled || !address) return;

        refresh();

        const interval = setInterval(refresh, pollInterval);
        return () => clearInterval(interval);
    }, [enabled, address, pollInterval, refresh]);

    return { status, isLoading, error, refresh };
}
