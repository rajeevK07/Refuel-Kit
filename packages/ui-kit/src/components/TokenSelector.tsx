// ─────────────────────────────────────────────────────
// TokenSelector — Choose token for refueling
// ─────────────────────────────────────────────────────

import React from "react";
import type { TokenBalance } from "@rootstock-kits/refuel-sdk";

export interface TokenSelectorProps {
    tokens: TokenBalance[];
    selectedToken: string | null;
    onSelect: (symbol: string) => void;
}

export const TokenSelector: React.FC<TokenSelectorProps> = ({
    tokens,
    selectedToken,
    onSelect,
}) => {
    const formatBalance = (balance: bigint, decimals: number): string => {
        if (balance === 0n) return "0";
        // H4: Use bigint arithmetic to avoid Number precision loss for large balances
        const divisor = BigInt(10 ** decimals);
        const whole = balance / divisor;
        const remainder = balance % divisor;
        if (whole === 0n && remainder === 0n) return "0";
        // Format fractional part with leading zeros
        const fracStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
        if (fracStr.length === 0) return whole.toLocaleString();
        const trimmedFrac = fracStr.slice(0, 6); // max 6 decimal places
        const result = parseFloat(`${whole}.${trimmedFrac}`);
        if (result < 0.0001) return "<0.0001";
        return result.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
    };

    return (
        <div className="refuel-tokens">
            <div className="refuel-tokens-label">Pay with</div>
            <div className="refuel-token-grid">
                {tokens.map(({ token, balance, canRefuel }) => (
                    <button
                        key={token.symbol}
                        className={`refuel-token-pill ${selectedToken === token.symbol ? "selected" : ""
                            } ${!canRefuel ? "disabled" : ""}`}
                        onClick={() => canRefuel && onSelect(token.symbol)}
                        disabled={!canRefuel}
                        type="button"
                    >
                        <div
                            className={`refuel-token-icon ${token.symbol.toLowerCase()}`}
                        >
                            {token.symbol === "RIF" ? "R" : "$"}
                        </div>
                        <div className="refuel-token-info">
                            <div className="refuel-token-name">{token.symbol}</div>
                            <div className="refuel-token-balance">
                                {formatBalance(balance, token.decimals)}{" "}
                                {!canRefuel && balance > 0n ? "(insufficient)" : ""}
                                {balance === 0n ? "(no balance)" : ""}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
