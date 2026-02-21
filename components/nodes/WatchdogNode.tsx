"use client";

import React, { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Eye } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";
import type { Detection } from "@/lib/types";

export default function WatchdogNode({ id, selected }: NodeProps) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [confidence, setConfidence] = useState(0.5);
  const [triggerLabel, setTriggerLabel] = useState("person");
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handler = (data: any) => {
      if (data.detections) {
        const filtered = data.detections.filter(
          (d: Detection) => d.confidence >= confidence
        );
        setDetections(filtered);
        setActive(filtered.length > 0);
      }
    };

    pipelineSocket.on("detection", handler);
    return () => pipelineSocket.off("detection", handler);
  }, [confidence]);

  return (
    <NodeShell
      accent="#f59e0b"
      title="Watchdog"
      icon={<Eye size={14} />}
      status={active ? "running" : "idle"}
      selected={selected}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="frames"
        style={{
          background: "#22d3ee",
          border: "2px solid #13131a",
        }}
      />

      {/* Detection Feed */}
      <div
        className="rounded-lg p-2 mb-3 space-y-1"
        style={{
          background: "#0a0a0f",
          minHeight: 60,
          maxHeight: 100,
          overflowY: "auto",
        }}
      >
        {detections.length === 0 ? (
          <p className="text-[10px] text-slate-600 text-center py-3">
            Waiting for detections...
          </p>
        ) : (
          detections.map((d, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-300">{d.label}</span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background:
                    d.confidence > 0.8
                      ? "#10b98120"
                      : d.confidence > 0.5
                      ? "#f59e0b20"
                      : "#ef444420",
                  color:
                    d.confidence > 0.8
                      ? "#10b981"
                      : d.confidence > 0.5
                      ? "#f59e0b"
                      : "#ef4444",
                }}
              >
                {(d.confidence * 100).toFixed(0)}%
              </span>
            </div>
          ))
        )}
      </div>

      {/* Confidence Threshold */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-slate-500 w-10">Conf.</span>
        <input
          type="range"
          min={10}
          max={95}
          value={confidence * 100}
          onChange={(e) => setConfidence(Number(e.target.value) / 100)}
          className="flex-1 h-1 accent-amber-400"
        />
        <span className="text-[10px] text-slate-400 font-mono w-7 text-right">
          {(confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Trigger Label */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-10">Trigger</span>
        <input
          type="text"
          value={triggerLabel}
          onChange={(e) => setTriggerLabel(e.target.value)}
          className="flex-1 bg-[#0a0a0f] border border-[#1e1e2e] rounded px-2 py-1 text-[11px] text-slate-300 outline-none focus:border-amber-500/40"
          placeholder="e.g. person"
        />
      </div>

      {/* Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="detections"
        style={{
          background: "#f59e0b",
          border: "2px solid #13131a",
          top: "40%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="triggered"
        style={{
          background: "#ef4444",
          border: "2px solid #13131a",
          top: "60%",
        }}
      />
    </NodeShell>
  );
}
