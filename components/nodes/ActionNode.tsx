"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { Zap, Bell, FileText, Webhook, Volume2 } from "lucide-react";
import NodeShell from "./NodeShell";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";

type ActionType = "sound" | "log" | "notification" | "webhook";

export default function ActionNode({ id, selected, data }: NodeProps) {
  const [actionType, setActionType] = useState<ActionType>(
    data?.actionType || "log"
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState(data?.webhookUrl || "");
  const [triggerCount, setTriggerCount] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const edges = useEdges();

  // Find connected source node and handle
  const { sourceNodeId, sourceHandle } = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "trigger"
    );
    return {
      sourceNodeId: incomingEdge?.source ?? null,
      sourceHandle: incomingEdge?.sourceHandle ?? null,
    };
  }, [edges, id]);

  // Resolve output key (handles compound keys from Logic node)
  const outputKey = useMemo(() => {
    if (!sourceNodeId) return null;
    if (sourceHandle && sourceHandle !== "response" && sourceHandle !== "output") {
      return `${sourceNodeId}:${sourceHandle}`;
    }
    return sourceNodeId;
  }, [sourceNodeId, sourceHandle]);

  const sourceOutput = useNodeOutputStore(
    (state) => (outputKey ? state.outputs[outputKey] : undefined)
  );
  const sourceVersion = useNodeOutputStore(
    (state) => (outputKey ? (state.versions[outputKey] ?? 0) : 0)
  );

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Play alert sound using Web Audio API
  const playAlertSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Three ascending beeps
      const frequencies = [600, 800, 1000];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.value = 0.25;
        gain.gain.exponentialRampToValueAtTime(
          0.01,
          ctx.currentTime + i * 0.2 + 0.18
        );
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.18);
      });
    } catch {
      // Audio API not available
    }
  }, []);

  // Trigger action when upstream output changes (version tracks every update)
  useEffect(() => {
    if (!sourceOutput || sourceVersion === 0) return;

    const timestamp = new Date().toLocaleTimeString();
    setTriggerCount((c) => c + 1);
    setLogs((prev) =>
      [`[${timestamp}] ${sourceOutput}`, ...prev].slice(0, 100)
    );

    if (actionType === "sound") {
      playAlertSound();
    } else if (actionType === "notification") {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("SnapFlow Alert", { body: sourceOutput });
      }
    } else if (actionType === "webhook" && webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: sourceOutput, timestamp }),
      }).catch(() => {});
    }
  }, [sourceVersion, actionType, webhookUrl, playAlertSound]);

  const actionIcons: Record<ActionType, React.ReactNode> = {
    sound: <Volume2 size={14} />,
    log: <FileText size={14} />,
    notification: <Bell size={14} />,
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
        id="trigger"
        style={{
          background: "#f59e0b",
          border: "2px solid #13131a",
        }}
      />

      {/* Action Type Selector */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {(["sound", "log", "notification", "webhook"] as ActionType[]).map(
          (t) => (
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
          )
        )}
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

      {/* Sound test button */}
      {actionType === "sound" && (
        <button
          onClick={playAlertSound}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors mb-4 nodrag"
          style={{
            background: "#10b98115",
            color: "#10b981",
            border: "1px solid #10b98125",
          }}
        >
          <Volume2 size={12} />
          Test Sound
        </button>
      )}

      {/* Log Feed */}
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
