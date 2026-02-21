"use client";

import React, { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Zap, Bell, FileText, Webhook } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";

type ActionType = "alert" | "log" | "webhook";

export default function ActionNode({ id, selected }: NodeProps) {
  const [actionType, setActionType] = useState<ActionType>("log");
  const [logs, setLogs] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [triggerCount, setTriggerCount] = useState(0);

  useEffect(() => {
    const handler = (data: any) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = data.analysis || data.trigger_label || "Triggered";

      setTriggerCount((c) => c + 1);
      setLogs((prev) => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));

      if (actionType === "alert") {
        // Desktop notification (works in Electron)
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("SnapFlow Alert", { body: message });
        }
      }
    };

    pipelineSocket.on("action_trigger", handler);
    return () => pipelineSocket.off("action_trigger", handler);
  }, [actionType]);

  const actionIcons = {
    alert: <Bell size={12} />,
    log: <FileText size={12} />,
    webhook: <Webhook size={12} />,
  };

  return (
    <NodeShell
      accent="#10b981"
      title="Action"
      icon={<Zap size={14} />}
      status={triggerCount > 0 ? "running" : "idle"}
      selected={selected}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          background: "#a855f7",
          border: "2px solid #13131a",
        }}
      />

      {/* Action Type Selector */}
      <div className="flex gap-1 mb-3">
        {(["alert", "log", "webhook"] as ActionType[]).map((t) => (
          <button
            key={t}
            onClick={() => setActionType(t)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              background: actionType === t ? "#10b98120" : "#0a0a0f",
              color: actionType === t ? "#10b981" : "#64748b",
              border: `1px solid ${
                actionType === t ? "#10b98130" : "#1e1e2e"
              }`,
            }}
          >
            {actionIcons[t]}
            {t}
          </button>
        ))}
      </div>

      {/* Webhook URL (conditional) */}
      {actionType === "webhook" && (
        <input
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-emerald-500/40 mb-3"
          placeholder="https://..."
        />
      )}

      {/* Log Feed */}
      <div
        className="rounded-lg p-2 space-y-0.5"
        style={{
          background: "#0a0a0f",
          minHeight: 50,
          maxHeight: 100,
          overflowY: "auto",
        }}
      >
        {logs.length === 0 ? (
          <p className="text-[10px] text-slate-600 text-center py-2">
            No triggers yet
          </p>
        ) : (
          logs.map((log, i) => (
            <p key={i} className="text-[10px] text-slate-400 font-mono truncate">
              {log}
            </p>
          ))
        )}
      </div>

      {/* Trigger counter */}
      <div className="mt-2 text-right">
        <span className="text-[9px] font-mono text-emerald-500/70">
          {triggerCount} triggers
        </span>
      </div>
    </NodeShell>
  );
}
