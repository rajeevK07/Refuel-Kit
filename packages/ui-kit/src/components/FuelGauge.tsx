// ─────────────────────────────────────────────────────
// FuelGauge — Visual RBTC level indicator
// ─────────────────────────────────────────────────────

import React from "react";

export interface FuelGaugeProps {
    /** RBTC balance in wei */
    balance: bigint;
    /** Maximum balance for "full" gauge (default: 0.01 RBTC) */
    maxBalance?: bigint;
}

export const FuelGauge: React.FC<FuelGaugeProps> = ({
    balance,
    maxBalance = 10_000_000_000_000_000n, // 0.01 RBTC
}) => {
    const percentage = maxBalance === 0n
        ? 0
        : Math.min(Number((balance * 100n) / maxBalance), 100);

    const level =
        percentage < 5 ? "critical" : percentage < 25 ? "low" : "ok";

    const formatBalance = (wei: bigint): string => {
        const ethValue = Number(wei) / 1e18;
        if (ethValue < 0.0001) return "<0.0001";
        return ethValue.toFixed(4);
    };

    return (
        <div className="refuel-gauge">
            <div className="refuel-gauge-bar">
                <div
                    className={`refuel-gauge-fill ${level}`}
                    style={{ width: `${Math.max(percentage, 2)}%` }}
                />
            </div>
            <div className="refuel-gauge-labels">
                <span className={`refuel-gauge-value ${level}`}>
                    {formatBalance(balance)} RBTC
                </span>
                <span className="refuel-gauge-label">
                    {level === "critical"
                        ? "⚠️ Empty"
                        : level === "low"
                            ? "⚡ Low"
                            : "✅ OK"}
                </span>
            </div>
        </div>
    );
};
