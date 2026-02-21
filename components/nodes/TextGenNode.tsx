"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { MessageSquare, Send, Loader } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";

export default function TextGenNode({ id, selected }: NodeProps) {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const handler = (data: any) => {
      if (data.node_id === id && data.text) {
        setOutput(data.text);
        setProcessing(false);
      }
    };

    pipelineSocket.on("text_gen_result", handler);
    return () => pipelineSocket.off("text_gen_result", handler);
  }, [id]);

  // Also listen for analysis input from reasoning brain
  useEffect(() => {
    const handler = (data: any) => {
      if (data.analysis) {
        setPrompt(
          `Based on this observation: "${data.analysis}"\n\nGenerate a concise action report.`
        );
      }
    };

    pipelineSocket.on("reasoning", handler);
    return () => pipelineSocket.off("reasoning", handler);
  }, []);

  const generate = useCallback(() => {
    if (!prompt.trim()) return;
    setProcessing(true);
    setOutput(null);
    pipelineSocket.sendTextGen(prompt, id);
  }, [prompt, id]);

  return (
    <NodeShell
      accent="#3b82f6"
      title="Text Generator"
      icon={<MessageSquare size={14} />}
      status={processing ? "running" : "idle"}
      selected={selected}
      width={280}
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

      {/* Model Badge */}
      <div className="mb-2">
        <span
          className="text-[9px] font-mono px-2 py-0.5 rounded-full"
          style={{
            background: "#3b82f615",
            color: "#3b82f6",
            border: "1px solid #3b82f625",
          }}
        >
          Nexa &middot; Llama-3.2-3B
        </span>
      </div>

      {/* Prompt Input */}
      <div className="relative mb-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-2.5 py-2 pr-8 text-[11px] text-slate-300 outline-none focus:border-blue-500/40 resize-none leading-relaxed"
          placeholder="Enter prompt..."
        />
        <button
          onClick={generate}
          disabled={processing || !prompt.trim()}
          className="absolute right-2 bottom-2 p-1 rounded transition-colors disabled:opacity-30"
          style={{ color: "#3b82f6" }}
        >
          {processing ? (
            <Loader size={14} className="animate-spin-slow" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>

      {/* Output */}
      <div
        className="rounded-lg p-2.5"
        style={{
          background: "#0a0a0f",
          minHeight: 40,
          maxHeight: 120,
          overflowY: "auto",
        }}
      >
        {processing ? (
          <div className="flex items-center gap-2 text-[11px] text-blue-400">
            <Loader size={12} className="animate-spin-slow" />
            Generating...
          </div>
        ) : output ? (
          <p className="text-[11px] text-slate-300 leading-relaxed">{output}</p>
        ) : (
          <p className="text-[10px] text-slate-600 text-center py-1">
            Output will appear here
          </p>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        style={{
          background: "#3b82f6",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
