// ─────────────────────────────────────────────────────
// FuelGauge — Visual RBTC level indicator
// ─────────────────────────────────────────────────────

import React from "react";

export interface FuelGaugeProps {
    /** RBTC balance in wei */
    balance: bigint;
    /** Maximum balance for "full" gauge (default: 0.01 RBTC) */
    maxBalance?: bigint;
    /** Threshold for "critical" level */
    threshold?: number;
}

export const FuelGauge: React.FC<FuelGaugeProps> = ({
    balance,
    maxBalance = 10_000_000_000_000_000n, // 0.01 RBTC
    threshold = 0.0001,
}) => {
    const percentage = maxBalance === 0n
        ? 0
        : Math.min(Number((balance * 100n) / maxBalance), 100);

    const level =
        percentage < 5 ? "critical" : percentage < 25 ? "low" : "ok";

    const formatBalance = (wei: bigint): string => {
        if (wei === 0n) return "0";

        const divisor = 1_000_000_000_000_000_000n; // 1e18
        const whole = wei / divisor;
        const remainder = wei % divisor;

        if (whole === 0n && remainder === 0n) return "0";

        const fracStr = remainder
            .toString()
            .padStart(18, "0")
            .replace(/0+$/, "");

        if (!fracStr) return whole.toString();

        const trimmed = fracStr.slice(0, 4);
        const asNumber = Number(`0.${trimmed}`);
        if (whole === 0n && asNumber < 0.0001) return "<0.0001";

        return `${whole.toString()}.${trimmed}`;
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
