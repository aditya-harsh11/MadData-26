"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { Ear, Loader } from "lucide-react";
import NodeShell from "./NodeShell";
import { pipelineSocket } from "@/lib/websocket";
import { useAudioStore } from "@/lib/audioStore";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";

/** Decode multiple base64 float32-PCM chunks, concatenate, re-encode as one base64 string. */
function concatBase64Pcm(chunks: string[]): string {
  const arrays: Uint8Array[] = [];
  let totalLen = 0;
  for (const b64 of chunks) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrays.push(bytes);
    totalLen += bytes.length;
  }
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    merged.set(a, offset);
    offset += a.length;
  }
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < merged.length; i += CHUNK) {
    binary += String.fromCharCode(...merged.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

type Phase = "idle" | "recording" | "analyzing";

export default function AudioLlmNode({ id, selected, data }: NodeProps) {
  const [prompt, setPrompt] = useState<string>(
    data?.prompt || "Describe what you hear. Identify any notable sounds."
  );
  const [listenDuration, setListenDuration] = useState<number>(
    data?.listenDuration ?? 3
  );
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [recordedSecs, setRecordedSecs] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);

  const phaseRef = useRef<Phase>("idle");
  const chunksRef = useRef<string[]>([]);
  const lastSeenAudioRef = useRef<string>("");
  const promptRef = useRef(prompt);

  // Sync state from data prop (e.g. when workflow generator replaces nodes)
  useEffect(() => {
    if (data?.prompt != null) setPrompt(data.prompt);
  }, [data?.prompt]);
  useEffect(() => {
    if (data?.listenDuration != null) setListenDuration(data.listenDuration);
  }, [data?.listenDuration]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  const edges = useEdges();

  // Find connected mic node
  const connectedMicId = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle === "audio"
    );
    return incomingEdge?.source ?? null;
  }, [edges, id]);

  // Listen for audio LLM results — transition back to recording
  useEffect(() => {
    const handler = (payload: any) => {
      if (payload.node_id === id) {
        setAnalysis(payload.analysis || "");
        setLatencyMs(payload.latency_ms || 0);
        useNodeOutputStore.getState().setOutput(id, payload.analysis || "");
        // Restart recording cycle
        chunksRef.current = [];
        lastSeenAudioRef.current = "";
        setRecordedSecs(0);
        setPhase("recording");
      }
    };
    pipelineSocket.on("audio_llm_result", handler);
    return () => pipelineSocket.off("audio_llm_result", handler);
  }, [id]);

  // Main loop: accumulate audio chunks, send when enough
  useEffect(() => {
    if (!connectedMicId) {
      setPhase("idle");
      return;
    }

    chunksRef.current = [];
    lastSeenAudioRef.current = "";
    setRecordedSecs(0);
    setPhase("recording");

    const pollInterval = setInterval(() => {
      if (phaseRef.current !== "recording") return;

      const audio = useAudioStore.getState().getAudio(connectedMicId);
      if (!audio || audio === lastSeenAudioRef.current) return;

      lastSeenAudioRef.current = audio;
      chunksRef.current.push(audio);
      setRecordedSecs(chunksRef.current.length);

      if (chunksRef.current.length >= listenDuration) {
        const combined = concatBase64Pcm(chunksRef.current);
        chunksRef.current = [];
        setRecordedSecs(0);
        setPhase("analyzing");
        pipelineSocket.sendAudioLlmAnalyze(combined, promptRef.current, id);
      }
    }, 200);

    return () => clearInterval(pollInterval);
  }, [connectedMicId, listenDuration, id]);

  // Safety timeout
  useEffect(() => {
    if (phase !== "analyzing") return;
    const timeout = setTimeout(() => {
      chunksRef.current = [];
      lastSeenAudioRef.current = "";
      setRecordedSecs(0);
      setPhase("recording");
    }, 30000);
    return () => clearTimeout(timeout);
  }, [phase]);

  // Manual trigger
  const manualAnalyze = useCallback(() => {
    if (!connectedMicId || phaseRef.current === "analyzing") return;
    const audio = useAudioStore.getState().getAudio(connectedMicId);
    if (!audio) return;
    // Send whatever we have
    const chunks = chunksRef.current.length > 0
      ? chunksRef.current
      : [audio];
    const combined = concatBase64Pcm(chunks);
    chunksRef.current = [];
    setRecordedSecs(0);
    setPhase("analyzing");
    pipelineSocket.sendAudioLlmAnalyze(combined, promptRef.current, id);
  }, [connectedMicId, id]);

  const recordPct =
    listenDuration > 0 ? Math.round((recordedSecs / listenDuration) * 100) : 0;

  return (
    <NodeShell
      accent="#ec4899"
      title="Audio LLM"
      icon={<Ear size={16} />}
      status={phase !== "idle" ? "running" : analysis ? "running" : "idle"}
      selected={selected}
      width={420}
    >
      {/* Input Handle — audio feed */}
      <Handle
        type="target"
        position={Position.Left}
        id="audio"
        data-tooltip="audio"
        style={{
          background: "#06b6d4",
          border: "2px solid #13131a",
        }}
      />

      {/* Handle label */}
      <div
        className="absolute text-[9px] font-mono text-cyan-500/60"
        style={{ left: 14, top: "32%" }}
      >
        audio
      </div>

      {/* Model Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full"
          style={{
            background: "#ec489915",
            color: "#ec4899",
            border: "1px solid #ec489925",
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
        {!connectedMicId && (
          <span className="text-[10px] text-slate-500 ml-auto">
            No mic connected
          </span>
        )}
      </div>

      {/* Recording Progress */}
      {phase === "recording" && connectedMicId && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-pink-400 font-medium">
              Recording {recordedSecs}/{listenDuration}s
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {recordPct}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "#1e1e2e" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${recordPct}%`,
                background: "linear-gradient(90deg, #ec4899, #f472b6)",
                transition: "width 0.3s ease-out",
              }}
            />
          </div>
        </div>
      )}

      {/* Listen Duration Slider */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-slate-500 w-16 shrink-0">Listen</span>
        <input
          type="range"
          min={1}
          max={10}
          value={listenDuration}
          onChange={(e) => setListenDuration(Number(e.target.value))}
          className="flex-1 h-1.5 accent-pink-400 nodrag nowheel"
        />
        <span className="text-xs text-slate-400 font-mono w-8 text-right">
          {listenDuration}s
        </span>
      </div>

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-pink-500/40 resize-none leading-relaxed mb-3 nodrag nowheel"
        placeholder="What should the AI listen for?"
      />

      {/* Manual trigger button */}
      <button
        onClick={manualAnalyze}
        disabled={phase === "analyzing" || !connectedMicId}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors mb-3 nodrag disabled:opacity-30"
        style={{
          background: "#ec489915",
          color: "#ec4899",
          border: "1px solid #ec489925",
        }}
      >
        {phase === "analyzing" ? (
          <>
            <Loader size={12} className="animate-spin" />
            Analyzing {listenDuration}s of audio...
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
        {phase === "analyzing" && !analysis ? (
          <div className="flex items-center gap-2 text-sm text-pink-400">
            <Loader size={14} className="animate-spin" />
            Analyzing audio...
          </div>
        ) : analysis ? (
          <p className="text-sm text-slate-300 leading-relaxed">{analysis}</p>
        ) : (
          <p className="text-xs text-slate-600 text-center py-3">
            Connect a microphone and set your prompt
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
          background: "#ec4899",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
