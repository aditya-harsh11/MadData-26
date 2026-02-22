"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { MessageSquare, Send, Loader } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";

export default function LlmNode({ id, selected, data }: NodeProps) {
  const [systemPrompt, setSystemPrompt] = useState<string>(
    data?.systemPrompt || ""
  );
  const [output, setOutput] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [manualPrompt, setManualPrompt] = useState("");
  const processingRef = useRef(false);

  const edges = useEdges();

  // Find connected upstream node
  const { sourceNodeId, sourceHandle } = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "input"
    );
    return {
      sourceNodeId: incomingEdge?.source ?? null,
      sourceHandle: incomingEdge?.sourceHandle ?? null,
    };
  }, [edges, id]);

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

  // Listen for text gen results
  useEffect(() => {
    const handler = (data: any) => {
      if (data.node_id === id) {
        const text = data.text || "";
        setOutput(text);
        setLatencyMs(data.latency_ms || 0);
        setProcessing(false);
        processingRef.current = false;
        useNodeOutputStore.getState().setOutput(id, text);
      }
    };
    pipelineSocket.on("text_gen_result", handler);
    return () => pipelineSocket.off("text_gen_result", handler);
  }, [id]);

  // Auto-trigger when upstream input changes (version tracks every update)
  useEffect(() => {
    if (!sourceOutput || sourceVersion === 0 || processingRef.current) return;

    const fullPrompt = systemPrompt.trim()
      ? `${systemPrompt.trim()}\n\nContext:\n${sourceOutput}`
      : sourceOutput;

    processingRef.current = true;
    setProcessing(true);
    setOutput(null);
    pipelineSocket.sendTextGen(fullPrompt, id);
  }, [sourceVersion, systemPrompt, id]);

  // Manual generate (for standalone use)
  const generate = useCallback(() => {
    if (!manualPrompt.trim() || processingRef.current) return;
    const fullPrompt = systemPrompt.trim()
      ? `${systemPrompt.trim()}\n\n${manualPrompt}`
      : manualPrompt;

    processingRef.current = true;
    setProcessing(true);
    setOutput(null);
    pipelineSocket.sendTextGen(fullPrompt, id);
  }, [manualPrompt, systemPrompt, id]);

  const hasUpstream = !!sourceNodeId;

  return (
    <NodeShell
      accent="#3b82f6"
      title="LLM"
      icon={<MessageSquare size={16} />}
      status={processing ? "running" : "idle"}
      selected={selected}
      width={380}
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
      <div className="mb-3">
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full"
          style={{
            background: "#3b82f615",
            color: "#3b82f6",
            border: "1px solid #3b82f625",
          }}
        >
          OmniNeural-4B &middot; text-only
        </span>
      </div>

      {/* System Prompt */}
      <div className="mb-3">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={2}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-blue-500/40 resize-none leading-relaxed nodrag nowheel"
          placeholder="Optional instructions for the LLM..."
        />
      </div>

      {/* Manual Input (shown when no upstream connection) */}
      {!hasUpstream && (
        <div className="relative mb-3">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
            Input
          </label>
          <textarea
            value={manualPrompt}
            onChange={(e) => setManualPrompt(e.target.value)}
            rows={2}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 pr-10 text-sm text-slate-300 outline-none focus:border-blue-500/40 resize-none leading-relaxed nodrag nowheel"
            placeholder="Enter prompt..."
          />
          <button
            onClick={generate}
            disabled={processing || !manualPrompt.trim()}
            className="absolute right-3 bottom-3 p-1 rounded transition-colors disabled:opacity-30 nodrag"
            style={{ color: "#3b82f6" }}
          >
            {processing ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      )}

      {/* Connected upstream indicator */}
      {hasUpstream && (
        <div className="mb-3 px-3 py-2 rounded-md text-xs text-slate-500" style={{ background: "#0a0a0f", border: "1px solid #1e1e2e" }}>
          {processing ? (
            <span className="flex items-center gap-2 text-blue-400">
              <Loader size={12} className="animate-spin" />
              Processing input...
            </span>
          ) : sourceOutput ? (
            <span className="text-slate-400">Auto-processing upstream input</span>
          ) : (
            "Waiting for upstream input..."
          )}
        </div>
      )}

      {/* Output */}
      <div
        className="rounded-lg p-3 nodrag nowheel"
        style={{
          background: "#0a0a0f",
          minHeight: 60,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {processing && !output ? (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <Loader size={14} className="animate-spin" />
            Generating...
          </div>
        ) : output ? (
          <p className="text-sm text-slate-300 leading-relaxed">{output}</p>
        ) : (
          <p className="text-xs text-slate-600 text-center py-3">
            Output will appear here
          </p>
        )}
      </div>

      {/* Latency */}
      {latencyMs > 0 && (
        <div className="mt-2 text-right">
          <span className="text-[10px] font-mono text-slate-500">
            {latencyMs.toFixed(0)}ms
          </span>
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          background: "#3b82f6",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
