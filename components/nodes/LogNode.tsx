"use client";

import React, { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { FileText, Download, Trash2 } from "lucide-react";
import NodeShell from "./NodeShell";
import { useUpstreamTrigger } from "@/lib/useUpstreamTrigger";

export default function LogNode({ id, selected }: NodeProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [triggerCount, setTriggerCount] = useState(0);

  const { sourceOutput, sourceVersion } = useUpstreamTrigger(id, "trigger");

  // Trigger on upstream change
  useEffect(() => {
    if (!sourceOutput || sourceVersion === 0) return;
    const timestamp = new Date().toLocaleTimeString();
    setTriggerCount((c) => c + 1);
    setLogs((prev) => [`[${timestamp}] ${sourceOutput}`, ...prev].slice(0, 100));
  }, [sourceVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCSV = () => {
    if (logs.length === 0) return;
    const header = "timestamp,message\n";
    const rows = logs
      .map((log) => {
        const bracketEnd = log.indexOf("] ");
        const ts = bracketEnd > 0 ? log.slice(1, bracketEnd) : "";
        const msg = bracketEnd > 0 ? log.slice(bracketEnd + 2) : log;
        return `"${ts}","${msg.replace(/"/g, '""')}"`;
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arcflow-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <NodeShell
      accent="#10b981"
      title="Log"
      icon={<FileText size={16} />}
      status={triggerCount > 0 ? "running" : "idle"}
      selected={selected}
      width={380}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        data-tooltip="trigger"
        style={{ background: "#f59e0b", border: "2px solid #13131a" }}
      />

      {/* Controls */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={exportCSV}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors nodrag disabled:opacity-40"
          style={{ background: "#10b98115", color: "#10b981", border: "1px solid #10b98125" }}
        >
          <Download size={12} />
          Export CSV
        </button>
        <button
          onClick={() => { setLogs([]); setTriggerCount(0); }}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors nodrag disabled:opacity-40"
          style={{ background: "#ef444415", color: "#ef4444", border: "1px solid #ef444425" }}
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>

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

      <div className="mt-3 text-right">
        <span className="text-xs font-mono text-emerald-500/70">{triggerCount} triggers</span>
      </div>
    </NodeShell>
  );
}
