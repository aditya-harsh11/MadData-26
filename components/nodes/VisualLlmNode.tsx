"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { Eye, Loader } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";
import { useFrameStore } from "@/lib/frameStore";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";

export default function VisualLlmNode({ id, selected, data }: NodeProps) {
  const [prompt, setPrompt] = useState<string>(
    data?.prompt || "Describe what you see. If there is any safety concern, explain it."
  );
  const [interval, setInterval_] = useState<number>(data?.interval || 10);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);

  const promptRef = useRef(prompt);
  const processingRef = useRef(false);
  const lastTriggerVersionRef = useRef(0);

  // Sync state from data prop (e.g. when workflow generator replaces nodes)
  useEffect(() => {
    if (data?.prompt != null) setPrompt(data.prompt);
  }, [data?.prompt]);
  useEffect(() => {
    if (data?.interval != null) setInterval_(data.interval);
  }, [data?.interval]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  const edges = useEdges();

  // Find connected camera node
  const connectedCameraId = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "camera"
    );
    return incomingEdge?.source ?? null;
  }, [edges, id]);

  // Find connected trigger node (optional — gates when VLM fires)
  const { triggerNodeId, triggerHandle } = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "trigger"
    );
    return {
      triggerNodeId: incomingEdge?.source ?? null,
      triggerHandle: incomingEdge?.sourceHandle ?? null,
    };
  }, [edges, id]);

  // A trigger is only valid if the source handle writes to the output store
  // (match, no_match, response, output, detections, etc.) — NOT "frames" from a camera
  const FRAME_HANDLES = new Set(["frames"]);
  const isValidTrigger = triggerNodeId !== null && !FRAME_HANDLES.has(triggerHandle ?? "");

  // Resolve trigger output key (handles compound keys like nodeId:match)
  const triggerKey = useMemo(() => {
    if (!isValidTrigger || !triggerNodeId) return null;
    if (triggerHandle && triggerHandle !== "response" && triggerHandle !== "output" && triggerHandle !== "detections") {
      return `${triggerNodeId}:${triggerHandle}`;
    }
    return triggerNodeId;
  }, [triggerNodeId, triggerHandle, isValidTrigger]);

  // Subscribe to trigger version changes
  const triggerVersion = useNodeOutputStore(
    (state) => (triggerKey ? (state.versions[triggerKey] ?? 0) : 0)
  );

  // Listen for VLM results
  useEffect(() => {
    const handler = (data: any) => {
      if (data.node_id === id) {
        setAnalysis(data.analysis);
        setLatencyMs(data.latency_ms || 0);
        setProcessing(false);
        processingRef.current = false;
        useNodeOutputStore.getState().setOutput(id, data.analysis || "");
      }
    };
    pipelineSocket.on("vlm_result", handler);
    return () => pipelineSocket.off("vlm_result", handler);
  }, [id]);

  // Helper to fire analysis
  const fireAnalysis = useCallback(() => {
    if (!connectedCameraId) return;
    const frame = useFrameStore.getState().getFrame(connectedCameraId);
    if (!frame || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    pipelineSocket.sendVlmAnalyze(frame, promptRef.current, id);
  }, [connectedCameraId, id]);

  // MODE 1: Interval timer (no trigger connected)
  useEffect(() => {
    if (isValidTrigger) return; // trigger mode takes over
    if (!connectedCameraId || !prompt.trim()) return;

    const initialTimeout = setTimeout(fireAnalysis, 500);
    const timer = setInterval(fireAnalysis, interval * 1000);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(timer);
    };
  }, [connectedCameraId, interval, prompt, isValidTrigger, fireAnalysis]);

  // MODE 2: Trigger-gated (trigger connected — fires when trigger updates)
  useEffect(() => {
    if (!isValidTrigger) return;
    if (!connectedCameraId || !prompt.trim()) return;
    if (triggerVersion === 0) return; // no trigger output yet

    // Debounce: don't fire faster than the interval
    if (triggerVersion === lastTriggerVersionRef.current) return;
    lastTriggerVersionRef.current = triggerVersion;

    // Small delay to let the frame store update
    const timeout = setTimeout(fireAnalysis, 200);
    return () => clearTimeout(timeout);
  }, [triggerVersion, isValidTrigger, connectedCameraId, prompt, fireAnalysis]);

  const manualAnalyze = useCallback(() => {
    fireAnalysis();
  }, [fireAnalysis]);

  return (
    <NodeShell
      accent="#a855f7"
      title="Visual LLM"
      icon={<Eye size={16} />}
      status={processing ? "running" : analysis ? "running" : "idle"}
      selected={selected}
      width={420}
    >
      {/* Input Handle — camera feed */}
      <Handle
        type="target"
        position={Position.Left}
        id="camera"
        data-tooltip="camera"
        style={{
          background: "#22d3ee",
          border: "2px solid #13131a",
          top: "35%",
        }}
      />

      {/* Input Handle — optional trigger */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        data-tooltip="trigger"
        style={{
          background: "#10b981",
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
          Nexa &middot; OmniNeural-4B
        </span>
        <span
          className="text-[10px] font-mono px-2 py-1 rounded-full"
          style={{
            background: "#10b98115",
            color: "#10b981",
            border: "1px solid #10b98125",
          }}
        >
          NPU
        </span>
        {!connectedCameraId && (
          <span className="text-[10px] text-slate-500 ml-auto">
            No camera connected
          </span>
        )}
      </div>

      {/* Trigger status */}
      {isValidTrigger && (
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 mb-3 text-[10px]"
          style={{
            background: "#10b98110",
            border: "1px solid #10b98120",
            color: "#10b981",
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "#10b981", boxShadow: "0 0 4px #10b981" }}
          />
          Trigger-gated — fires only when trigger updates
        </div>
      )}

      {/* Interval Slider (shows purpose based on mode) */}
      {!isValidTrigger && (
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-slate-500 w-16 shrink-0">Interval</span>
          <input
            type="range"
            min={5}
            max={120}
            value={interval}
            onChange={(e) => setInterval_(Number(e.target.value))}
            className="flex-1 h-1.5 accent-purple-400 nodrag nowheel"
          />
          <span className="text-xs text-slate-400 font-mono w-8 text-right">
            {interval}s
          </span>
        </div>
      )}

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-purple-500/40 resize-none leading-relaxed mb-3 nodrag nowheel"
        placeholder="What should the AI look for?"
      />

      {/* Manual trigger button */}
      <button
        onClick={manualAnalyze}
        disabled={processing || !connectedCameraId}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors mb-3 nodrag disabled:opacity-30"
        style={{
          background: "#a855f715",
          color: "#a855f7",
          border: "1px solid #a855f725",
        }}
      >
        {processing ? (
          <>
            <Loader size={12} className="animate-spin" />
            Analyzing...
          </>
        ) : (
          "Analyze Now"
        )}
      </button>

      {/* Response */}
      <div
        className="rounded-lg p-3 nodrag nowheel"
        style={{
          background: "#0a0a0f",
          minHeight: 60,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {processing && !analysis ? (
          <div className="flex items-center gap-2 text-sm text-purple-400">
            <Loader size={14} className="animate-spin" />
            Analyzing frame...
          </div>
        ) : analysis ? (
          <p className="text-sm text-slate-300 leading-relaxed">{analysis}</p>
        ) : (
          <p className="text-xs text-slate-600 text-center py-3">
            Connect a camera and set your prompt
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

      {/* Output Handle — response text */}
      <Handle
        type="source"
        position={Position.Right}
        id="response"
        data-tooltip="response"
        style={{
          background: "#a855f7",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
