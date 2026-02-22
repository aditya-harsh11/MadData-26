"use client";

import React from "react";

interface NodeShellProps {
  accent: string;
  title: string;
  icon: React.ReactNode;
  status?: "idle" | "running" | "error";
  selected?: boolean;
  children: React.ReactNode;
  width?: number;
}

export default function NodeShell({
  accent,
  title,
  icon,
  status = "idle",
  selected,
  children,
  width = 360,
}: NodeShellProps) {
  const statusColors = {
    idle: "#64748b",
    running: accent,
    error: "#ef4444",
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        width,
        background: "#13131a",
        border: `1.5px solid ${selected ? accent : "#1e1e2e"}`,
        boxShadow: selected
          ? `0 0 20px ${accent}22, 0 4px 24px rgba(0,0,0,0.5)`
          : "0 4px 24px rgba(0,0,0,0.4)",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${accent}12 0%, transparent 60%)`,
          borderBottom: "1px solid #1e1e2e",
        }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        <span
          className="text-sm font-semibold tracking-wide uppercase flex-1"
          style={{ color: "#e2e8f0" }}
        >
          {title}
        </span>
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            background: statusColors[status],
            boxShadow:
              status === "running"
                ? `0 0 6px ${accent}`
                : undefined,
            animation:
              status === "running" ? "pulse-glow 2s ease-in-out infinite" : undefined,
          }}
        />
      </div>

      {/* Body */}
      <div className="p-4">{children}</div>
    </div>
  );
}
