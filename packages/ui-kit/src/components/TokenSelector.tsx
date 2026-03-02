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
        const value = Number(balance) / Math.pow(10, decimals);
        if (value === 0) return "0";
        if (value < 0.01) return "<0.01";
        return value.toFixed(2);
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
