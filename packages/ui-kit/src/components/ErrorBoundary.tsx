import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("RefuelWidget Error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.fallback) return this.fallback;
      
      return (
        <div className="refuel-error-boundary">
          <div className="refuel-error-header">
            <span className="refuel-error-icon">⚠️</span>
            <div className="refuel-error-title">Something went wrong</div>
          </div>
          <div className="refuel-error-content">
            {this.state.error?.message || "An unexpected error occurred in the Refuel Widget."}
          </div>
          <button 
            className="refuel-btn refuel-btn-secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.children;
  }

  private get children() {
    return this.props.children;
  }

  private get fallback() {
    return this.props.fallback;
  }
}
