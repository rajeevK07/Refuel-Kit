// ─────────────────────────────────────────────────────
// StatusDisplay — Step-by-step progress indicator
// ─────────────────────────────────────────────────────

import React from "react";
import type { RefuelState } from "@rootstock-kits/refuel-sdk";

export interface StatusDisplayProps {
    state: RefuelState;
    blockExplorerUrl?: string;
}

const STEPS = [
    { id: "checking", label: "Checking balance" },
    { id: "signing", label: "Sign permit (gasless)" },
    { id: "relaying", label: "Submitting to relayer" },
    { id: "confirming", label: "Confirming on-chain" },
] as const;

function getStepStatus(
    stepId: string,
    currentState: RefuelState
): "pending" | "active" | "done" | "error" {
    const stateOrder: Record<string, number> = {
        "checking-balance": 0,
        "awaiting-signature": 1,
        relaying: 2,
        confirming: 3,
        success: 4,
        error: -1,
    };

    const stepOrder: Record<string, number> = {
        checking: 0,
        signing: 1,
        relaying: 2,
        confirming: 3,
    };

    if (currentState.step === "error") {
        // Show all steps as error — we don't know which step failed at runtime
        return "error";
    }

    const currentIdx = stateOrder[currentState.step] ?? -1;
    const stepIdx = stepOrder[stepId] ?? -1;

    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
}

const STEP_ICONS: Record<string, string> = {
    pending: "○",
    active: "◉",
    done: "✓",
    error: "✕",
};

export const StatusDisplay: React.FC<StatusDisplayProps> = ({
    state,
    blockExplorerUrl,
}) => {
    if (state.step === "idle") return null;

    if (state.step === "success") {
        return (
            <div className="refuel-success">
                <div className="refuel-success-icon">⛽</div>
                <div className="refuel-success-title">Gas Tank Filled!</div>
                <div className="refuel-success-amount">
                    {(() => {
                        const wei = state.result.rbtcReceived;
                        const divisor = 1_000_000_000_000_000_000n;
                        const whole = wei / divisor;
                        const remainder = wei % divisor;
                        const fracStr = remainder
                            .toString()
                            .padStart(18, "0")
                            .slice(0, 4);
                        return `+${whole.toString()}.${fracStr} RBTC received`;
                    })()}
                </div>
                {blockExplorerUrl && (
                    <a
                        href={`${blockExplorerUrl}/tx/${state.result.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="refuel-tx-link"
                    >
                        View Transaction ↗
                    </a>
                )}
            </div>
        );
    }

    return (
        <div className="refuel-status">
            <div className="refuel-status-steps">
                {STEPS.map((step) => {
                    const status = getStepStatus(step.id, state);
                    return (
                        <div key={step.id} className="refuel-step">
                            <div className={`refuel-step-indicator ${status}`}>
                                {STEP_ICONS[status]}
                            </div>
                            <div className={`refuel-step-text ${status}`}>
                                {step.label}
                            </div>
                        </div>
                    );
                })}
            </div>

            {state.step === "error" && (
                <div className="refuel-error-box">{state.error.message}</div>
            )}
        </div>
    );
};
