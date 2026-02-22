"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Mic, Play, Square } from "lucide-react";
import NodeShell from "./NodeShell";
import { AudioCapture } from "@/lib/audioCapture";
import { useAudioStore } from "@/lib/audioStore";
import { useWorkflowStore } from "@/lib/workflowStore";
import { useNodeData } from "@/lib/useNodeData";
import {
  isSwitching,
  getSwitchFromWorkflowId,
  parkCapture,
  reclaimCapture,
} from "@/lib/captureRegistry";

export default function MicNode({ id, selected, data }: NodeProps) {
  const captureRef = useRef<AudioCapture | null>(null);
  const levelRef = useRef<number>(0);
  const [active, setActive] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const animFrameRef = useRef<number>(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>(data?.selectedDevice ?? "");

  const updateData = useNodeData(id);
  useEffect(() => {
    updateData({ selectedDevice });
  }, [selectedDevice, updateData]);

  // ── Combined reclaim + cleanup effect (must be defined BEFORE enumerate) ──
  useEffect(() => {
    // Try to reclaim parked capture on mount
    const wfId = useWorkflowStore.getState().activeWorkflowId;
    if (wfId) {
      const parked = reclaimCapture(wfId, id);
      if (parked && parked.type === "mic") {
        const capture = parked.capture;

        // Remove namespaced audio key
        useAudioStore.getState().removeAudio(`${wfId}::${id}`);

        // Rewire callback to plain key
        capture.stop();
        capture.startCapture((base64Pcm) => {
          setChunkCount((c) => c + 1);
          useAudioStore.getState().setAudio(id, base64Pcm);
        });

        captureRef.current = capture;
        setActive(true);

        // Restart level meter animation
        const updateLevel = () => {
          if (captureRef.current) {
            const l = captureRef.current.getLevel();
            levelRef.current = l;
            setLevel(l);
            animFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        animFrameRef.current = requestAnimationFrame(updateLevel);
      }
    }

    // Cleanup: always re-park instead of destroying.
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      const capture = captureRef.current;
      if (!capture) return;
      captureRef.current = null;

      const parkWfId = isSwitching()
        ? getSwitchFromWorkflowId()
        : useWorkflowStore.getState().activeWorkflowId;

      if (parkWfId) {
        useAudioStore.getState().removeAudio(id);
        capture.stop();
        capture.startCapture((base64Pcm) => {
          useAudioStore.getState().setAudio(`${parkWfId}::${id}`, base64Pcm);
        });
        parkCapture(parkWfId, id, {
          type: "mic",
          capture,
          nodeId: id,
          workflowId: parkWfId,
        });
      } else {
        capture.destroy();
        useAudioStore.getState().removeAudio(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Enumerate audio input devices (skipped if we reclaimed a capture) ──
  useEffect(() => {
    if (captureRef.current) return; // Already have a capture from reclaim
    const enumerate = async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "audioinput"));
      } catch {
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          setDevices(all.filter((d) => d.kind === "audioinput"));
        } catch {}
      }
    };
    enumerate();
  }, []);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      const capture = new AudioCapture();
      await capture.init(selectedDevice || undefined);

      capture.startCapture((base64Pcm) => {
        setChunkCount((c) => c + 1);
        useAudioStore.getState().setAudio(id, base64Pcm);
      });

      captureRef.current = capture;
      setActive(true);

      // Animate level meter
      const updateLevel = () => {
        if (captureRef.current) {
          const l = captureRef.current.getLevel();
          levelRef.current = l;
          setLevel(l);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };
      animFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (err: any) {
      setError(err.message || "Microphone access denied");
    }
  }, [id, selectedDevice]);

  const stopCapture = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    captureRef.current?.destroy();
    captureRef.current = null;
    setActive(false);
    setLevel(0);
    useAudioStore.getState().removeAudio(id);
  }, [id]);

  // Clamp level for display (0-100%)
  const levelPct = Math.min(100, Math.round(level * 300));

  return (
    <NodeShell
      accent="#06b6d4"
      title="Microphone"
      icon={<Mic size={16} />}
      status={active ? "running" : error ? "error" : "idle"}
      selected={selected}
      width={300}
    >
      {/* Device Picker */}
      {devices.length > 1 && (
        <div className="mb-3">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={active}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-md px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500/40 nodrag nowheel disabled:opacity-50"
          >
            <option value="">Default Microphone</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Audio Level Meter */}
      <div
        className="relative rounded-lg overflow-hidden mb-4"
        style={{
          background: "#0a0a0f",
          height: 48,
        }}
      >
        {active ? (
          <div className="flex items-center h-full px-3 gap-3">
            <Mic size={18} className="text-cyan-400 flex-shrink-0" />
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "#1e1e2e" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${levelPct}%`,
                  background: levelPct > 70
                    ? "linear-gradient(90deg, #06b6d4, #f59e0b)"
                    : "linear-gradient(90deg, #06b6d4, #22d3ee)",
                  transition: "width 0.05s ease-out",
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-cyan-400 w-8 text-right">
              #{chunkCount}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Mic size={24} className="text-slate-600" />
          </div>
        )}
      </div>

      {/* Controls */}
      <button
        onClick={active ? stopCapture : startCapture}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors nodrag"
        style={{
          background: active ? "#ef444420" : "#06b6d415",
          color: active ? "#ef4444" : "#06b6d4",
          border: `1px solid ${active ? "#ef444430" : "#06b6d425"}`,
        }}
      >
        {active ? <Square size={14} /> : <Play size={14} />}
        {active ? "Stop" : "Start Capture"}
      </button>

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="audio"
        data-tooltip="audio"
        style={{
          background: "#06b6d4",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
