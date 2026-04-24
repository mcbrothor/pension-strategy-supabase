import React from "react";
import { Btn } from "./index.jsx";

export default class PanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "패널 렌더링 중 오류가 발생했습니다.",
    };
  }

  componentDidCatch(error, info) {
    console.error("[PanelErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--alert-danger-color)",
        borderRadius: "var(--border-radius-lg)",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--alert-danger-color)", marginBottom: 6 }}>
          패널 오류
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 12 }}>
          {this.state.message}
        </div>
        <Btn sm onClick={this.reset}>다시 시도</Btn>
      </div>
    );
  }
}
