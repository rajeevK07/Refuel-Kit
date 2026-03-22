// ─────────────────────────────────────────────────────
// RefuelWidget — Drop-in rescue component
// ─────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useMemo } from "react";
import type { Address, WalletClient } from "viem";
import type { Hash } from "viem";
import type {
    RefuelConfig,
    TokenSymbol,
    TokenBalance,
    BalanceStatus,
    RootstockChainId,
} from "@rootstock-kits/refuel-sdk";
import { CHAIN_CONFIGS, RefuelClient } from "@rootstock-kits/refuel-sdk";

import { FuelGauge } from "./FuelGauge";
import { TokenSelector } from "./TokenSelector";
import { StatusDisplay } from "./StatusDisplay";
import { useRefuel } from "../hooks/useRefuel";
import { useBalanceMonitor } from "../hooks/useBalanceMonitor";
import { ErrorBoundary } from "./ErrorBoundary";
import "../styles/refuel.css";

export interface RefuelWidgetProps {
    /** User's wallet address */
    address?: Address;
    /** Wallet client for signing (from wagmi/viem) */
    walletClient?: WalletClient;
    /** RBTC balance threshold to trigger refuel prompt (default: 0.0001 RBTC) */
    threshold?: number;
    /** Allowed tokens for refueling */
    allowedTokens?: TokenSymbol[];
    /** Chain ID (default: 31 testnet) */
    chainId?: RootstockChainId;
    /** Custom relayer URL */
    relayerUrl?: string;
    /** Custom contract address */
    contractAddress?: Address;
    /** Callback when refuel succeeds */
    onSuccess?: (txHash: Hash) => void;
    /** Callback when refuel fails */
    onError?: (error: Error) => void;
    /** Callback when user dismisses the widget */
    onDismiss?: () => void;
    /** Whether to auto-expand when low balance detected */
    autoExpand?: boolean;
}

export const RefuelWidget: React.FC<RefuelWidgetProps> = (props) => {
    return (
        <ErrorBoundary>
            <RefuelWidgetContent {...props} />
        </ErrorBoundary>
    );
};

const RefuelWidgetContent: React.FC<RefuelWidgetProps> = ({
    address,
    walletClient,
    threshold = 0.0001,
    allowedTokens = ["USDC", "RIF"],
    chainId = 31,
    relayerUrl,
    contractAddress,
    onSuccess,
    onError,
    onDismiss,
    autoExpand = true,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedToken, setSelectedToken] = useState<TokenSymbol | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const config: RefuelConfig = useMemo(() => ({
        chainId,
        relayerUrl,
        contractAddress,
    }), [chainId, relayerUrl, contractAddress]);

    const memoizedAllowedTokens = useMemo(() => allowedTokens, [allowedTokens]);

    const chainConfig = CHAIN_CONFIGS[chainId];

    // Monitor balance
    const { status: balanceStatus } =
        useBalanceMonitor({
            address,
            config,
            enabled: !!address && !dismissed,
        });

    // Refuel flow
    const { state: refuelState, refuel, reset } = useRefuel({ config });

    // Auto-expand when low balance detected
    useEffect(() => {
        if (autoExpand && balanceStatus?.needsRefuel && !dismissed) {
            setIsExpanded(true);
        }
    }, [autoExpand, balanceStatus?.needsRefuel, dismissed]);

    // Handle success/error callbacks — explicitly list onSuccess/onError in deps (M6)
    useEffect(() => {
        if (refuelState.step === "success" && onSuccess) {
            onSuccess(refuelState.result.txHash);
        }
        if (refuelState.step === "error" && onError) {
            onError(refuelState.error);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refuelState.step, onSuccess, onError]);

    // Auto-select first available token
    useEffect(() => {
        if (!selectedToken && balanceStatus) {
            const available = balanceStatus.tokenBalances.find(
                (tb) => tb.canRefuel && memoizedAllowedTokens.includes(tb.token.symbol)
            );
            if (available) {
                setSelectedToken(available.token.symbol);
            }
        }
    }, [balanceStatus, selectedToken, memoizedAllowedTokens]);

    const handleRefuel = useCallback(async () => {
        if (!selectedToken || !walletClient) return;
        await refuel(selectedToken, walletClient);
    }, [selectedToken, walletClient, refuel]);

    const handleDismiss = useCallback(() => {
        setDismissed(true);
        setIsExpanded(false);
        onDismiss?.();
    }, [onDismiss]);

    const handleReset = useCallback(() => {
        reset();
        setSelectedToken(null);
    }, [reset]);

    // Don't render if:
    // - No address
    // - Balance is fine
    // - Dismissed
    if (!address || dismissed) return null;
    if (balanceStatus && !balanceStatus.needsRefuel) return null;

    // Filter tokens by allowedTokens
    const filteredTokens: TokenBalance[] =
        balanceStatus?.tokenBalances.filter((tb) =>
            allowedTokens.includes(tb.token.symbol)
        ) ?? [];

    const isProcessing =
        refuelState.step !== "idle" &&
        refuelState.step !== "success" &&
        refuelState.step !== "error";

    // ─── Collapsed Banner ──────────────────────────

    if (!isExpanded) {
        return (
            <div className="refuel-widget">
                <div
                    className="refuel-banner"
                    onClick={() => setIsExpanded(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setIsExpanded(true)}
                >
                    <span className="refuel-banner-icon">⛽</span>
                    <div className="refuel-banner-text">
                        <span>Low Gas</span> — Refuel with{" "}
                        {allowedTokens.join(" or ")}
                    </div>
                    <span className="refuel-banner-arrow">→</span>
                </div>
            </div>
        );
    }

    // ─── Expanded Card ─────────────────────────────

    return (
        <div className="refuel-widget">
            <div className="refuel-card">
                {/* Header */}
                <div className="refuel-header">
                    <div className="refuel-header-left">
                        <div className="refuel-header-icon">⛽</div>
                        <div>
                            <div className="refuel-title">Refuel Station</div>
                            <div className="refuel-subtitle">
                                Swap tokens for RBTC gas — gasless
                            </div>
                        </div>
                    </div>
                    <button
                        className="refuel-close-btn"
                        onClick={handleDismiss}
                        type="button"
                        aria-label="Dismiss refuel widget"
                    >
                        ✕
                    </button>
                </div>

                {/* Fuel Gauge */}
                {balanceStatus && (
                    <FuelGauge balance={balanceStatus.rbtcBalance} threshold={threshold} />
                )}

                {/* Active Flow: Status Display */}
                {refuelState.step !== "idle" ? (
                    <>
                        <StatusDisplay
                            state={refuelState}
                            blockExplorerUrl={chainConfig?.blockExplorerUrl}
                        />

                        {/* Retry / Done buttons */}
                        {(refuelState.step === "success" ||
                            refuelState.step === "error") && (
                                <div className="refuel-actions">
                                    <button
                                        className="refuel-btn refuel-btn-primary"
                                        onClick={
                                            refuelState.step === "error" ? handleReset : handleDismiss
                                        }
                                        type="button"
                                    >
                                        {refuelState.step === "error" ? "Try Again" : "Done"}
                                    </button>
                                </div>
                            )}
                    </>
                ) : (
                    <>
                        {/* Token Selector */}
                        <TokenSelector
                            tokens={filteredTokens}
                            selectedToken={selectedToken}
                            onSelect={(symbol) =>
                                setSelectedToken(symbol as TokenSymbol)
                            }
                        />

                        {/* Swap Preview */}
                        {selectedToken && (() => {
                            // Look up token config for accurate amount display
                            const selectedTokenConfig = balanceStatus?.tokenBalances.find(
                                (tb) => tb.token.symbol === selectedToken
                            )?.token;
                            const tokenAmount = selectedTokenConfig
                                ? (Number(selectedTokenConfig.refuelAmount) / Math.pow(10, selectedTokenConfig.decimals)).toFixed(0)
                                : "5";

                            return (
                                <div className="refuel-preview">
                                    <div className="refuel-preview-row">
                                        <span className="refuel-preview-label">You pay</span>
                                        <span className="refuel-preview-value">
                                            {tokenAmount} {selectedToken}
                                        </span>
                                    </div>
                                    <div className="refuel-preview-row">
                                        <span className="refuel-preview-label">You receive</span>
                                        <span className="refuel-preview-value highlight">
                                            0.001 RBTC
                                        </span>
                                    </div>
                                    <div className="refuel-preview-row">
                                        <span className="refuel-preview-label">Gas fee</span>
                                        <span className="refuel-preview-value">Free ✨</span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Action Button */}
                        <div className="refuel-actions">
                            <button
                                className={`refuel-btn refuel-btn-primary ${isProcessing ? "loading" : ""
                                    }`}
                                onClick={handleRefuel}
                                disabled={!selectedToken || !walletClient || isProcessing}
                                type="button"
                            >
                                {!walletClient
                                    ? "Connect Wallet"
                                    : !selectedToken
                                        ? "Select a Token"
                                        : isProcessing
                                            ? "Processing..."
                                            : `Refuel with ${selectedToken}`}
                            </button>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="refuel-footer">
                    Powered by{" "}
                    <a
                        href="https://rootstock.io"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Rootstock Refuel Kit
                    </a>
                </div>
            </div>
        </div>
    );
};
