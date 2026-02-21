"use client";

import React, { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Brain, Loader } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";

export default function ReasoningBrainNode({ id, selected }: NodeProps) {
  const [prompt, setPrompt] = useState(
    "Describe what you see. If there is any safety concern, explain it."
  );
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [model] = useState("OmniNeural-4B");

  useEffect(() => {
    const handler = (data: any) => {
      if (data.analysis) {
        setAnalysis(data.analysis);
        setProcessing(false);
      }
    };

    pipelineSocket.on("reasoning", handler);
    return () => pipelineSocket.off("reasoning", handler);
  }, []);

  useEffect(() => {
    const handler = (data: any) => {
      // When triggered by watchdog, start reasoning
      setProcessing(true);
    };

    pipelineSocket.on("trigger_reasoning", handler);
    return () => pipelineSocket.off("trigger_reasoning", handler);
  }, []);

  return (
    <NodeShell
      accent="#a855f7"
      title="Reasoning Brain"
      icon={<Brain size={14} />}
      status={processing ? "running" : "idle"}
      selected={selected}
      width={300}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        style={{
          background: "#ef4444",
          border: "2px solid #13131a",
          top: "35%",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="frames"
        style={{
          background: "#22d3ee",
          border: "2px solid #13131a",
          top: "55%",
        }}
      />

      {/* Model Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[9px] font-mono px-2 py-0.5 rounded-full"
          style={{
            background: "#a855f715",
            color: "#a855f7",
            border: "1px solid #a855f725",
          }}
        >
          Nexa &middot; {model}
        </span>
        <span
          className="text-[9px] font-mono px-2 py-0.5 rounded-full"
          style={{
            background: "#10b98115",
            color: "#10b981",
            border: "1px solid #10b98125",
          }}
        >
          NPU
        </span>
      </div>

      {/* Prompt Input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-2.5 py-2 text-[11px] text-slate-300 outline-none focus:border-purple-500/40 resize-none mb-3 leading-relaxed"
        placeholder="Enter reasoning prompt..."
      />

      {/* Analysis Output */}
      <div
        className="rounded-lg p-2.5"
        style={{
          background: "#0a0a0f",
          minHeight: 50,
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {processing ? (
          <div className="flex items-center gap-2 text-[11px] text-purple-400">
            <Loader size={12} className="animate-spin-slow" />
            Reasoning...
          </div>
        ) : analysis ? (
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {analysis}
          </p>
        ) : (
          <p className="text-[10px] text-slate-600 text-center py-2">
            Awaiting trigger from Watchdog...
          </p>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="analysis"
        style={{
          background: "#a855f7",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
