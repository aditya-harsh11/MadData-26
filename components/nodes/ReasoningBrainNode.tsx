"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
  const [interval, setInterval_] = useState(5);
  const [model] = useState("OmniNeural-4B");
  const promptSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send prompt to backend whenever it changes (debounced)
  const syncPrompt = useCallback((newPrompt: string) => {
    if (promptSyncTimer.current) clearTimeout(promptSyncTimer.current);
    promptSyncTimer.current = setTimeout(() => {
      pipelineSocket.sendConfig({ reasoning_prompt: newPrompt });
    }, 500);
  }, []);

  // Send initial prompt + interval on mount
  useEffect(() => {
    const sendInitial = () => {
      pipelineSocket.sendConfig({
        reasoning_prompt: prompt,
        reasoning_interval: interval,
      });
    };

    if (pipelineSocket.connected) {
      sendInitial();
    }

    const handler = (data: any) => {
      if (data.connected) {
        setTimeout(sendInitial, 300);
      }
    };
    pipelineSocket.on("status", handler);
    return () => {
      pipelineSocket.off("status", handler);
      if (promptSyncTimer.current) clearTimeout(promptSyncTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const handler = () => setProcessing(true);
    pipelineSocket.on("trigger_reasoning", handler);
    return () => pipelineSocket.off("trigger_reasoning", handler);
  }, []);

  const handleIntervalChange = useCallback((val: number) => {
    setInterval_(val);
    pipelineSocket.sendConfig({ reasoning_interval: val });
  }, []);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = e.target.value;
      setPrompt(newPrompt);
      syncPrompt(newPrompt);
    },
    [syncPrompt]
  );

  return (
    <NodeShell
      accent="#a855f7"
      title="Reasoning Brain"
      icon={<Brain size={16} />}
      status={processing ? "running" : "idle"}
      selected={selected}
      width={400}
    >
      {/* Input Handles */}
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
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full"
          style={{
            background: "#a855f715",
            color: "#a855f7",
            border: "1px solid #a855f725",
          }}
        >
          Nexa &middot; {model}
        </span>
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full"
          style={{
            background: "#10b98115",
            color: "#10b981",
            border: "1px solid #10b98125",
          }}
        >
          NPU
        </span>
      </div>

      {/* Reasoning Interval Slider */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-slate-500 w-16">Interval</span>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={interval}
          onChange={(e) => handleIntervalChange(Number(e.target.value))}
          className="flex-1 h-1.5 accent-purple-400 nodrag nowheel"
        />
        <span className="text-xs text-slate-400 font-mono w-10 text-right">
          {interval}s
        </span>
      </div>

      {/* Prompt Input */}
      <textarea
        value={prompt}
        onChange={handlePromptChange}
        rows={3}
        className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-purple-500/40 resize-none mb-4 leading-relaxed nodrag nowheel"
        placeholder="Enter reasoning prompt..."
      />

      {/* Analysis Output */}
      <div
        className="rounded-lg p-3 nodrag nowheel"
        style={{
          background: "#0a0a0f",
          minHeight: 80,
          maxHeight: 250,
          overflowY: "auto",
        }}
      >
        {processing ? (
          <div className="flex items-center gap-2 text-sm text-purple-400">
            <Loader size={14} className="animate-spin-slow" />
            Reasoning...
          </div>
        ) : analysis ? (
          <p className="text-sm text-slate-300 leading-relaxed">{analysis}</p>
        ) : (
          <p className="text-xs text-slate-600 text-center py-4">
            Awaiting first reasoning cycle...
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
