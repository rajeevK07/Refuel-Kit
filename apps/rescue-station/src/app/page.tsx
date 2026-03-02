"use client";

import React, { useState, useCallback } from "react";
import {
    RefuelClient,
    REFUEL_THRESHOLD,
    type BalanceStatus,
} from "@rootstock-kits/refuel-sdk";
import { RefuelWidget } from "@rootstock-kits/refuel-ui";
import type { Address } from "viem";

// Initialize SDK client (testnet)
const refuelClient = new RefuelClient({ chainId: 31 });

export default function RescueStationPage() {
    const [addressInput, setAddressInput] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<BalanceStatus | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [showWidget, setShowWidget] = useState(false);

    const handleScan = useCallback(async () => {
        const addr = addressInput.trim();
        if (!addr || !addr.startsWith("0x") || addr.length !== 42) {
            setScanError("Please enter a valid Rootstock address (0x...)");
            return;
        }

        setIsScanning(true);
        setScanError(null);
        setScanResult(null);

        try {
            const result = await refuelClient.checkBalance(addr as Address);
            setScanResult(result);
            if (result.needsRefuel) {
                setShowWidget(true);
            }
        } catch (err) {
            setScanError(
                err instanceof Error ? err.message : "Failed to scan wallet"
            );
        } finally {
            setIsScanning(false);
        }
    }, [addressInput]);

    const formatBalance = (wei: bigint): string => {
        const value = Number(wei) / 1e18;
        if (value === 0) return "0";
        if (value < 0.0001) return "<0.0001";
        return value.toFixed(6);
    };

    return (
        <div className="rescue-app">
            {/* ─── Navigation ────────────────────────────── */}
            <nav className="rescue-nav">
                <div className="rescue-logo">
                    <div className="rescue-logo-icon">⛽</div>
                    <span>Rescue Station</span>
                </div>
                <div className="rescue-nav-links">
                    <a href="#how-it-works" className="rescue-nav-link">
                        How It Works
                    </a>
                    <a href="#technology" className="rescue-nav-link">
                        Technology
                    </a>
                    <a
                        href="https://github.com/rootstock-kits/refuel-kit"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rescue-nav-link"
                    >
                        GitHub
                    </a>
                </div>
            </nav>

            {/* ─── Hero Section ──────────────────────────── */}
            <section className="rescue-hero">
                <div className="rescue-hero-badge">
                    🚨 Emergency Gas Recovery
                </div>

                <h1>
                    Stranded on Rootstock?
                    <br />
                    <span className="gradient-text">We&apos;ve got gas.</span>
                </h1>

                <p>
                    Bridged tokens but forgot RBTC? You&apos;re stuck — you have money
                    but can&apos;t move. Rescue Station swaps your RIF or USDC for
                    RBTC gas, <strong>completely gasless</strong>.
                </p>

                {/* ─── Diagnostic Scanner ───────────────── */}
                <div className="rescue-scanner">
                    <div className="rescue-scanner-title">
                        🔍 Wallet Diagnostic
                    </div>
                    <div className="rescue-scanner-subtitle">
                        Enter your Rootstock address to check if you&apos;re stuck
                    </div>

                    <div className="rescue-scanner-input-group">
                        <input
                            type="text"
                            className="rescue-scanner-input"
                            placeholder="0x... your Rootstock address"
                            value={addressInput}
                            onChange={(e) => setAddressInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleScan()}
                            id="wallet-address-input"
                        />
                        <button
                            className="rescue-scan-btn"
                            onClick={handleScan}
                            disabled={isScanning || !addressInput.trim()}
                            id="scan-button"
                        >
                            {isScanning ? "Scanning..." : "Scan"}
                        </button>
                    </div>

                    {/* Scan Error */}
                    {scanError && (
                        <div className="rescue-verdict stuck" id="scan-error">
                            ⚠️ {scanError}
                        </div>
                    )}

                    {/* Scan Results */}
                    {scanResult && (
                        <>
                            <div className="rescue-diagnostic" id="scan-results">
                                <div className="rescue-diagnostic-row">
                                    <span className="rescue-diagnostic-label">RBTC Balance</span>
                                    <span
                                        className={`rescue-diagnostic-value ${scanResult.needsRefuel ? "danger" : "success"
                                            }`}
                                    >
                                        {scanResult.needsRefuel ? "⚠️" : "✅"}{" "}
                                        {formatBalance(scanResult.rbtcBalance)} RBTC
                                    </span>
                                </div>

                                {scanResult.tokenBalances.map((tb) => (
                                    <div key={tb.token.symbol} className="rescue-diagnostic-row">
                                        <span className="rescue-diagnostic-label">
                                            {tb.token.symbol} Balance
                                        </span>
                                        <span
                                            className={`rescue-diagnostic-value ${tb.canRefuel
                                                    ? "success"
                                                    : tb.balance > 0n
                                                        ? "warning"
                                                        : "danger"
                                                }`}
                                        >
                                            {formatBalance(tb.balance)} {tb.token.symbol}
                                        </span>
                                    </div>
                                ))}

                                <div className="rescue-diagnostic-row">
                                    <span className="rescue-diagnostic-label">Gas Status</span>
                                    <span
                                        className={`rescue-diagnostic-value ${scanResult.needsRefuel ? "danger" : "success"
                                            }`}
                                    >
                                        {scanResult.needsRefuel ? "🔴 STUCK" : "🟢 OK"}
                                    </span>
                                </div>
                            </div>

                            {/* Verdict */}
                            <div
                                className={`rescue-verdict ${scanResult.needsRefuel ? "stuck" : "ok"
                                    }`}
                                id="scan-verdict"
                            >
                                {scanResult.needsRefuel
                                    ? "🚨 You are stranded! Use the Refuel Widget below to rescue yourself."
                                    : "✅ Your gas tank is fine. No rescue needed."}
                            </div>

                            {/* Refuel Widget */}
                            {scanResult.needsRefuel && showWidget && (
                                <div className="rescue-widget-container">
                                    <RefuelWidget
                                        address={addressInput as Address}
                                        chainId={31}
                                        allowedTokens={["USDC", "RIF"]}
                                        autoExpand={true}
                                        onSuccess={(txHash) => {
                                            console.log("Refueled! TX:", txHash);
                                        }}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            {/* ─── How It Works ──────────────────────────── */}
            <section className="rescue-how-it-works" id="how-it-works">
                <h2 className="rescue-section-title">How It Works</h2>
                <p className="rescue-section-subtitle">
                    Four steps. Zero gas. One rescue.
                </p>

                <div className="rescue-flow-steps">
                    <div className="rescue-flow-step">
                        <div className="rescue-flow-step-number">1</div>
                        <div className="rescue-flow-step-icon">🔍</div>
                        <h3>Detect</h3>
                        <p>
                            The widget monitors your RBTC balance. When it drops below
                            0.0001 RBTC, it triggers Rescue Mode.
                        </p>
                    </div>

                    <div className="rescue-flow-step">
                        <div className="rescue-flow-step-number">2</div>
                        <div className="rescue-flow-step-icon">✍️</div>
                        <h3>Sign</h3>
                        <p>
                            You sign an EIP-712 Permit message off-chain. This authorizes
                            the swap without spending any gas.
                        </p>
                    </div>

                    <div className="rescue-flow-step">
                        <div className="rescue-flow-step-number">3</div>
                        <div className="rescue-flow-step-icon">📡</div>
                        <h3>Relay</h3>
                        <p>
                            The signed payload is sent to the Relayer, which submits the
                            transaction and pays the RBTC gas.
                        </p>
                    </div>

                    <div className="rescue-flow-step">
                        <div className="rescue-flow-step-number">4</div>
                        <div className="rescue-flow-step-icon">⛽</div>
                        <h3>Refuel</h3>
                        <p>
                            The smart contract swaps 5 tokens for 0.001 RBTC and sends it
                            directly to your wallet. You&apos;re free!
                        </p>
                    </div>
                </div>
            </section>

            {/* ─── Technology Section ────────────────────── */}
            <section className="rescue-tech" id="technology">
                <h2 className="rescue-section-title">Built With</h2>
                <p className="rescue-section-subtitle">
                    Production-grade technology for trustless gas recovery
                </p>

                <div className="rescue-tech-badges">
                    <span className="rescue-tech-badge">EIP-2612 Permit</span>
                    <span className="rescue-tech-badge">EIP-712 Typed Data</span>
                    <span className="rescue-tech-badge">Solidity 0.8.20</span>
                    <span className="rescue-tech-badge">OpenZeppelin</span>
                    <span className="rescue-tech-badge">Viem</span>
                    <span className="rescue-tech-badge">React 18</span>
                    <span className="rescue-tech-badge">TypeScript</span>
                    <span className="rescue-tech-badge">Foundry</span>
                    <span className="rescue-tech-badge">Rootstock</span>
                    <span className="rescue-tech-badge">RIF Relay</span>
                </div>
            </section>

            {/* ─── Footer ────────────────────────────────── */}
            <footer className="rescue-footer">
                Built with ❤️ for the Rootstock ecosystem —{" "}
                <a
                    href="https://rootstock.io"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    rootstock.io
                </a>
            </footer>
        </div>
    );
}
