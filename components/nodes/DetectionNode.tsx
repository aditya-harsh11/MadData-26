"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { ScanSearch, Loader, CheckCircle, XCircle } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";
import { useFrameStore } from "@/lib/frameStore";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";

interface Detection {
  label: string;
  confidence: number;
  bbox?: [number, number, number, number];
}

export default function DetectionNode({ id, selected, data }: NodeProps) {
  const [confidence, setConfidence] = useState<number>(
    data?.confidence ?? 45
  );
  const [interval, setInterval_] = useState<number>(data?.interval ?? 2);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [processing, setProcessing] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [filterText, setFilterText] = useState<string>(data?.filterLabels ?? "");
  const [retrigger, setRetrigger] = useState(data?.retrigger ?? true);
  const [lastMatch, setLastMatch] = useState<boolean | null>(null);

  const processingRef = useRef(false);
  const lastOutputRef = useRef<string | null>(null);

  // Parse comma-separated filter into lowercase label list
  const filterLabels = useMemo(() => {
    if (!filterText.trim()) return null; // null = no filter, show all
    return filterText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }, [filterText]);

  const edges = useEdges();

  // Find connected camera node
  const connectedCameraId = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "camera"
    );
    return incomingEdge?.source ?? null;
  }, [edges, id]);

  // Filter detections by user-specified labels
  const filteredDetections = useMemo(() => {
    if (!filterLabels || filterLabels.length === 0) return detections;
    return detections.filter((d) =>
      filterLabels.some((f) => d.label.toLowerCase().includes(f))
    );
  }, [detections, filterLabels]);

  // Listen for detection results from backend
  useEffect(() => {
    const handler = (payload: any) => {
      if (payload.node_id === id) {
        const dets: Detection[] = payload.detections || [];
        setDetections(dets);
        setLatencyMs(payload.latency_ms || 0);
        setProcessing(false);
        processingRef.current = false;
      }
    };
    pipelineSocket.on("detection_result", handler);
    return () => pipelineSocket.off("detection_result", handler);
  }, [id]);

  // Write filtered detections to output store using match/no_match compound keys
  useEffect(() => {
    const matched = filteredDetections.length > 0;
    setLastMatch(matched);

    const outputText = matched
      ? filteredDetections.map((d) => `${d.label} (${(d.confidence * 100).toFixed(0)}%)`).join(", ")
      : "nothing detected";

    // Skip if same output and retrigger is off
    if (!retrigger && outputText === lastOutputRef.current) return;
    lastOutputRef.current = outputText;

    const store = useNodeOutputStore.getState();
    if (matched) {
      store.setOutput(`${id}:match`, outputText);
    } else {
      store.setOutput(`${id}:no_match`, outputText);
    }
  }, [filteredDetections, id, retrigger]);

  // Periodic detection timer — send frames to backend for YOLO inference
  useEffect(() => {
    if (!connectedCameraId) return;

    const detect = () => {
      const frame = useFrameStore.getState().getFrame(connectedCameraId);
      if (!frame || processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      pipelineSocket.sendDetect(frame, id, confidence / 100);
    };

    const initialTimeout = setTimeout(detect, 500);
    const timer = setInterval(detect, interval * 1000);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(timer);
    };
  }, [connectedCameraId, interval, id, confidence]);

  const confColor = (c: number) => {
    if (c >= 0.75) return "#10b981";
    if (c >= 0.5) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <NodeShell
      accent="#f97316"
      title="Object Detect"
      icon={<ScanSearch size={16} />}
      status={processing ? "running" : detections.length > 0 ? "running" : "idle"}
      selected={selected}
      width={340}
    >
      {/* Input Handle — camera feed */}
      <Handle
        type="target"
        position={Position.Left}
        id="camera"
        style={{
          background: "#22d3ee",
          border: "2px solid #13131a",
        }}
      />

      {/* Model Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full"
          style={{
            background: "#f9731615",
            color: "#f97316",
            border: "1px solid #f9731625",
          }}
        >
          YOLOv8n &middot; ONNX
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

      {/* Confidence Threshold */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs text-slate-500 w-16 shrink-0">
          Confidence
        </span>
        <input
          type="range"
          min={10}
          max={95}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="flex-1 h-1.5 accent-orange-400 nodrag nowheel"
        />
        <span className="text-xs text-slate-400 font-mono w-10 text-right">
          {confidence}%
        </span>
      </div>

      {/* Interval Slider */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-slate-500 w-16 shrink-0">Interval</span>
        <input
          type="range"
          min={1}
          max={30}
          value={interval}
          onChange={(e) => setInterval_(Number(e.target.value))}
          className="flex-1 h-1.5 accent-orange-400 nodrag nowheel"
        />
        <span className="text-xs text-slate-400 font-mono w-10 text-right">
          {interval}s
        </span>
      </div>

      {/* Object Filter */}
      <div className="mb-3">
        <span className="text-xs text-slate-500 block mb-1.5">
          Filter objects
        </span>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="e.g. person, car, dog"
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-orange-500/40 font-mono nodrag nowheel"
        />
      </div>

      {/* Retrigger Toggle */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer nodrag select-none">
        <button
          onClick={() => setRetrigger((v: boolean) => !v)}
          className="w-8 h-[18px] rounded-full relative transition-colors nodrag"
          style={{
            background: retrigger ? "#f9731640" : "#1e1e2e",
            border: `1px solid ${retrigger ? "#f9731650" : "#2a2a3a"}`,
          }}
        >
          <div
            className="absolute top-[2px] w-3 h-3 rounded-full transition-all"
            style={{
              background: retrigger ? "#f97316" : "#64748b",
              left: retrigger ? 14 : 2,
            }}
          />
        </button>
        <span className="text-[11px] text-slate-400">
          Fire every detection cycle
        </span>
      </label>

      {/* Detection List */}
      <div
        className="rounded-lg p-3 nodrag nowheel"
        style={{
          background: "#0a0a0f",
          minHeight: 50,
          maxHeight: 180,
          overflowY: "auto",
        }}
      >
        {processing && detections.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-orange-400">
            <Loader size={14} className="animate-spin" />
            Detecting objects...
          </div>
        ) : filteredDetections.length > 0 ? (
          <div className="space-y-1.5">
            {filteredDetections.map((d, i) => (
              <div
                key={`${d.label}-${i}`}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-300 capitalize">{d.label}</span>
                <span
                  className="font-mono"
                  style={{ color: confColor(d.confidence) }}
                >
                  {(d.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600 text-center py-2">
            {connectedCameraId
              ? detections.length > 0 && filteredDetections.length === 0
                ? `No matches for "${filterText}" (${detections.length} filtered out)`
                : "No objects detected"
              : "Connect a camera to start detection"}
          </p>
        )}
      </div>

      {/* Match/No Match Result */}
      {lastMatch !== null && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2 mt-2"
          style={{
            background: lastMatch ? "#10b98115" : "#ef444415",
            border: `1px solid ${lastMatch ? "#10b98125" : "#ef444425"}`,
          }}
        >
          {lastMatch ? (
            <CheckCircle size={14} className="text-emerald-400" />
          ) : (
            <XCircle size={14} className="text-red-400" />
          )}
          <span
            className="text-xs font-medium"
            style={{ color: lastMatch ? "#10b981" : "#ef4444" }}
          >
            {lastMatch ? "MATCH" : "NO MATCH"}
          </span>
          <span className="text-[10px] text-slate-500 ml-auto font-mono">
            {filteredDetections.length} object{filteredDetections.length !== 1 ? "s" : ""}
            {filterLabels && detections.length !== filteredDetections.length
              ? ` / ${detections.length} total`
              : ""}
          </span>
        </div>
      )}

      {/* Latency */}
      {latencyMs > 0 && (
        <div className="mt-1 text-right">
          <span className="text-[10px] font-mono text-slate-500">
            {latencyMs.toFixed(0)}ms
          </span>
        </div>
      )}

      {/* Output Handles — match / no_match */}
      <Handle
        type="source"
        position={Position.Right}
        id="match"
        style={{
          background: "#10b981",
          border: "2px solid #13131a",
          top: "40%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no_match"
        style={{
          background: "#ef4444",
          border: "2px solid #13131a",
          top: "65%",
        }}
      />

      {/* Handle labels */}
      <div
        className="absolute text-[9px] font-mono text-emerald-500/60"
        style={{ right: 14, top: "37%" }}
      >
        match
      </div>
      <div
        className="absolute text-[9px] font-mono text-red-500/60"
        style={{ right: 14, top: "62%" }}
      >
        no match
      </div>
    </NodeShell>
  );
}
