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
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const handler = (data: any) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = data.analysis || data.trigger_label || "Triggered";

      setTriggerCount((c) => c + 1);
      setLogs((prev) => [`[${timestamp}] ${message}`, ...prev].slice(0, 100));

      if (actionType === "alert") {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("SnapFlow Alert", { body: message });
        }
      }
    };

    const changeHandler = (data: any) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = data.message || "Scene changed";

      setTriggerCount((c) => c + 1);
      setLogs((prev) => [
        `[${timestamp}] ⚠ CHANGE: ${message}`,
        ...prev,
      ].slice(0, 100));

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("SnapFlow — Scene Changed", { body: message });
      }
    };

    pipelineSocket.on("action_trigger", handler);
    pipelineSocket.on("change_alert", changeHandler);
    return () => {
      pipelineSocket.off("action_trigger", handler);
      pipelineSocket.off("change_alert", changeHandler);
    };
  }, [actionType]);

  const actionIcons = {
    alert: <Bell size={14} />,
    log: <FileText size={14} />,
    webhook: <Webhook size={14} />,
  };

  return (
    <NodeShell
      accent="#10b981"
      title="Action"
      icon={<Zap size={16} />}
      status={triggerCount > 0 ? "running" : "idle"}
      selected={selected}
      width={400}
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
      <div className="flex gap-1.5 mb-4">
        {(["alert", "log", "webhook"] as ActionType[]).map((t) => (
          <button
            key={t}
            onClick={() => setActionType(t)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors nodrag"
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
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-md px-3 py-2 text-sm text-slate-300 outline-none focus:border-emerald-500/40 mb-4 nodrag"
          placeholder="https://..."
        />
      )}

      {/* Log Feed — big, readable, scrollable */}
      <div
        className="rounded-lg p-3 space-y-1 nodrag nowheel"
        style={{
          background: "#0a0a0f",
          minHeight: 120,
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {logs.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-4">
            No triggers yet
          </p>
        ) : (
          logs.map((log, i) => (
            <p
              key={i}
              className="text-sm text-slate-300 font-mono leading-relaxed"
              style={{ wordBreak: "break-word" }}
            >
              {log}
            </p>
          ))
        )}
      </div>

      {/* Trigger counter */}
      <div className="mt-3 text-right">
        <span className="text-xs font-mono text-emerald-500/70">
          {triggerCount} triggers
        </span>
      </div>
    </NodeShell>
  );
}
