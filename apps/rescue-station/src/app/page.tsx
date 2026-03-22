"use client";

import React, { useState, useCallback } from "react";
import {
    RefuelClient,
    REFUEL_THRESHOLD,
    CHAIN_CONFIGS,
    ERC20_ABI,
    type BalanceStatus,
} from "@rootstock-kits/refuel-sdk";
import { RefuelWidget } from "@rootstock-kits/refuel-ui";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";

export default function RescueStationPage() {
    const [currentChainId, setCurrentChainId] = useState<30 | 31>(31);
    const [addressInput, setAddressInput] = useState("");
    const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<BalanceStatus | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [showWidget, setShowWidget] = useState(false);
    // Approval state for non-permit tokens (e.g. RIF)
    const [needsApproval, setNeedsApproval] = useState<{ spenderAddress: Address; tokenAddress: Address; requiredAmount: bigint } | null>(null);
    const [isApproving, setIsApproving] = useState(false);

    // Dynamic refuel client based on connected chain
    const refuelClient = React.useMemo(() => new RefuelClient({
        chainId: currentChainId,
        relayerUrl: typeof window !== "undefined" ? window.location.origin : "http://localhost"
    }), [currentChainId]);

    const connectWallet = useCallback(async () => {
        if (typeof window === "undefined" || !(window as any).ethereum) {
            setScanError("No wallet detected. Please install MetaMask or another Rootstock-compatible wallet.");
            return;
        }

        try {
            const provider = (window as any).ethereum;
            if (!provider) throw new Error("No ethereum provider");

            const chainIdHex = await provider.request({ method: "eth_chainId" });
            const detectedChainId = parseInt(chainIdHex, 16);

            if (detectedChainId !== 30 && detectedChainId !== 31) {
                setScanError("Unsupported chain. Please switch to Rootstock Mainnet or Testnet.");
                return;
            }

            const activeChainId = detectedChainId as 30 | 31;
            setCurrentChainId(activeChainId);

            const [address] = await provider.request({ method: "eth_requestAccounts" });
            setAddressInput(address);

            const chain = activeChainId === 30 ? rootstock : rootstockTestnet;

            const client = createWalletClient({
                account: address,
                chain,
                transport: custom(provider)
            });
            setWalletClient(client);

            // Auto-scan after connection
            const tempClient = new RefuelClient({
                chainId: activeChainId,
                relayerUrl: typeof window !== "undefined" ? window.location.origin : "http://localhost"
            });
            const result = await tempClient.checkBalance(address as Address);
            setScanResult(result);
            if (result.needsRefuel) {
                setShowWidget(true);
            }
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "Failed to connect wallet");
        }
    }, []);

    // Listen for account/network changes
    React.useEffect(() => {
        const provider = (window as any).ethereum;
        if (provider) {
            const handleChainChanged = () => window.location.reload();
            const handleAccountsChanged = (accounts: string[]) => {
                if (accounts.length === 0) {
                    setAddressInput("");
                    setWalletClient(null);
                } else {
                    connectWallet();
                }
            };
            provider.on("chainChanged", handleChainChanged);
            provider.on("accountsChanged", handleAccountsChanged);
            return () => {
                provider.removeListener("chainChanged", handleChainChanged);
                provider.removeListener("accountsChanged", handleAccountsChanged);
            };
        }
    }, [connectWallet]);

    const disconnectWallet = useCallback(() => {
        setAddressInput("");
        setWalletClient(null);
        setScanResult(null);
        setShowWidget(false);
    }, []);

    const switchNetwork = useCallback(async (targetChainId: 30 | 31) => {
        if (typeof window === "undefined" || !(window as any).ethereum) return;
        const provider = (window as any).ethereum;

        const chainIdHex = targetChainId === 30 ? '0x1e' : '0x1f';

        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
            });
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                try {
                    const chainParams = targetChainId === 30 ? {
                        chainId: '0x1e',
                        chainName: 'Rootstock Mainnet',
                        rpcUrls: ['https://public-node.rsk.co'],
                        nativeCurrency: { name: 'RBTC', symbol: 'RBTC', decimals: 18 },
                        blockExplorerUrls: ['https://rootstock.blockscout.com']
                    } : {
                        chainId: '0x1f',
                        chainName: 'Rootstock Testnet',
                        rpcUrls: ['https://public-node.testnet.rsk.co'],
                        nativeCurrency: { name: 'tRBTC', symbol: 'tRBTC', decimals: 18 },
                        blockExplorerUrls: ['https://rootstock-testnet.blockscout.com']
                    };

                    await provider.request({
                        method: 'wallet_addEthereumChain',
                        params: [chainParams],
                    });
                } catch (addError) {
                    console.error("Failed to add network:", addError);
                }
            } else {
                console.error("Failed to switch network:", switchError);
            }
        }
    }, []);

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

    /**
     * Handles approval for non-permit tokens (e.g. RIF via ERC20.approve).
     * The user signs the approve tx in MetaMask, then the relayer can execute the swap.
     */
    const handleApprove = useCallback(async () => {
        if (!walletClient || !needsApproval) return;
        setIsApproving(true);
        try {
            const txHash = await walletClient.writeContract({
                address: needsApproval.tokenAddress,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [needsApproval.spenderAddress, needsApproval.requiredAmount],
            } as any);
            // Wait briefly then clear approval state so widget can retry
            setTimeout(() => {
                setNeedsApproval(null);
                setIsApproving(false);
            }, 3000);
        } catch (err) {
            console.error("Approval failed:", err);
            setIsApproving(false);
        }
    }, [walletClient, needsApproval]);

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

                    {addressInput ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '1rem' }}>
                            <select
                                value={currentChainId}
                                onChange={(e) => switchNetwork(Number(e.target.value) as 30 | 31)}
                                style={{ padding: '0.5rem', borderRadius: '100px', border: '1px solid #333', background: '#222', color: '#fff', cursor: 'pointer', outline: 'none', fontSize: '0.9rem' }}
                            >
                                <option value={30}>RSK Mainnet</option>
                                <option value={31}>RSK Testnet</option>
                            </select>

                            <button
                                onClick={disconnectWallet}
                                title="Disconnect Wallet"
                                style={{ padding: '0.5rem 1rem', borderRadius: '100px', border: '1px solid #ff4d4d', background: 'transparent', color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', transition: 'all 0.2s' }}
                                onMouseOver={(e) => { e.currentTarget.style.background = '#ff4d4d'; e.currentTarget.style.color = '#fff'; }}
                                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ff4d4d'; }}
                            >
                                {`${addressInput.slice(0, 6)}...${addressInput.slice(-4)} ⏻`}
                            </button>
                        </div>
                    ) : (
                        <button
                            className="rescue-nav-btn"
                            onClick={connectWallet}
                            style={{ marginLeft: "1rem", padding: "0.5rem 1rem", borderRadius: "100px", border: "none", background: "#ff4d4d", color: "#fff", cursor: "pointer", fontWeight: "bold", fontSize: '0.9rem' }}
                        >
                            Connect Wallet
                        </button>
                    )}
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
                        Connect your wallet to check if you&apos;re stuck
                    </div>

                    {!addressInput ? (
                        <div className="rescue-scanner-input-group" style={{ justifyContent: 'center' }}>
                            <button
                                className="rescue-scan-btn"
                                onClick={connectWallet}
                                id="connect-wallet-button"
                            >
                                Connect Wallet
                            </button>
                        </div>
                    ) : (
                        <div className="rescue-scanner-input-group" style={{ justifyContent: 'center' }}>
                            <button
                                className="rescue-scan-btn secondary"
                                onClick={handleScan}
                                disabled={isScanning}
                                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}
                            >
                                {isScanning ? "Scanning..." : "Rescan Wallet"}
                            </button>
                        </div>
                    )}

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

                                {scanResult.tokenBalances.map((tb: any) => (
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
                                    {/* Approve Step (for non-permit tokens like RIF) */}
                                    {needsApproval && (
                                        <div className="rescue-verdict stuck" style={{ marginBottom: '1rem', textAlign: 'center', padding: '1.5rem', borderRadius: '16px' }}>
                                            <div style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>⚠️ Token Approval Required</div>
                                            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', marginBottom: '1rem' }}>
                                                RIF does not support gasless approval. You need to authorize the contract to spend your tokens first. This requires a small amount of RBTC for gas.
                                            </div>
                                            <button
                                                onClick={handleApprove}
                                                disabled={isApproving}
                                                style={{
                                                    padding: '0.75rem 1.5rem',
                                                    borderRadius: '100px',
                                                    border: 'none',
                                                    background: isApproving ? '#666' : 'linear-gradient(135deg, #fb923c, #f97316)',
                                                    color: '#fff',
                                                    fontWeight: 'bold',
                                                    fontSize: '1rem',
                                                    cursor: isApproving ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                {isApproving ? '⏳ Approving...' : '✅ Approve RIF in MetaMask'}
                                            </button>
                                        </div>
                                    )}

                                    <RefuelWidget
                                        address={addressInput as Address}
                                        walletClient={walletClient as any}
                                        chainId={currentChainId}
                                        relayerUrl={typeof window !== "undefined" ? window.location.origin : ""}
                                        allowedTokens={["USDC", "RIF"]}
                                        autoExpand={true}
                                        onSuccess={(txHash) => {
                                            console.log("Refueled! TX:", txHash);
                                            setNeedsApproval(null);
                                        }}
                                        onError={(err) => {
                                            // Detect NeedsApprovalError from relay
                                            if (err.name === 'NeedsApprovalError' || err.message.includes('approval required')) {
                                                const chainConfig = CHAIN_CONFIGS[currentChainId];
                                                // Default to RIF token for testnet (non-permit token)
                                                const rifToken = chainConfig.tokens.RIF;
                                                setNeedsApproval({
                                                    spenderAddress: chainConfig.refuelSwapAddress,
                                                    tokenAddress: rifToken.address,
                                                    requiredAmount: rifToken.refuelAmount,
                                                });
                                            }
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
