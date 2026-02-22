"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Camera, Play, Square } from "lucide-react";
import NodeShell from "./NodeShell";
import { FrameCapture } from "@/lib/frameCapture";
import { useFrameStore } from "@/lib/frameStore";
import { useWorkflowStore } from "@/lib/workflowStore";
import {
  isSwitching,
  getSwitchFromWorkflowId,
  parkCapture,
  reclaimCapture,
} from "@/lib/captureRegistry";

export default function CameraNode({ id, selected }: NodeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureRef = useRef<FrameCapture | null>(null);
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState(3);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  // ── Combined reclaim + cleanup effect (must be defined BEFORE enumerate) ──
  useEffect(() => {
    // Try to reclaim a parked capture on mount
    const wfId = useWorkflowStore.getState().activeWorkflowId;
    if (wfId) {
      const parked = reclaimCapture(wfId, id);
      if (parked && parked.type === "camera") {
        const capture = parked.capture;

        // Remove namespaced frame key
        useFrameStore.getState().removeFrame(`${wfId}::${id}`);

        // Rewire callback to plain key
        capture.stop();
        capture.startCapture((base64) => {
          setFrameCount((c) => c + 1);
          useFrameStore.getState().setFrame(id, base64);
        });

        captureRef.current = capture;

        // Connect stream to preview video
        if (videoRef.current) {
          const stream = capture.getStream();
          if (stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        }

        setActive(true);
      }
    }

    // Cleanup: always re-park instead of destroying.
    // This handles workflow switches, React strict mode re-mounts, AND node deletion.
    // Parked captures are cleaned up by destroyWorkflowCaptures on workflow delete.
    return () => {
      const capture = captureRef.current;
      if (!capture) return;
      captureRef.current = null;

      // Determine which workflow to park under
      const parkWfId = isSwitching()
        ? getSwitchFromWorkflowId()
        : useWorkflowStore.getState().activeWorkflowId;

      if (parkWfId) {
        useFrameStore.getState().removeFrame(id);
        capture.stop();
        capture.startCapture((base64) => {
          useFrameStore.getState().setFrame(`${parkWfId}::${id}`, base64);
        });
        parkCapture(parkWfId, id, {
          type: "camera",
          capture,
          nodeId: id,
          workflowId: parkWfId,
        });
      } else {
        capture.destroy();
        useFrameStore.getState().removeFrame(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Enumerate video input devices (skipped if we reclaimed a capture) ──
  useEffect(() => {
    if (captureRef.current) return; // Already have a capture from reclaim
    const enumerate = async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach((t) => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch {
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          setDevices(all.filter((d) => d.kind === "videoinput"));
        } catch {}
      }
    };
    enumerate();
  }, []);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      const capture = new FrameCapture({
        fps,
        width: 1280,
        height: 720,
        deviceId: selectedDevice || undefined,
      });
      const stream = await capture.init();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      capture.startCapture((base64) => {
        setFrameCount((c) => c + 1);
        useFrameStore.getState().setFrame(id, base64);
      });

      captureRef.current = capture;
      setActive(true);
    } catch (err: any) {
      setError(err.message || "Camera access denied");
    }
  }, [fps, id, selectedDevice]);

  const stopCapture = useCallback(() => {
    captureRef.current?.destroy();
    captureRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActive(false);
    useFrameStore.getState().removeFrame(id);
  }, [id]);

  return (
    <NodeShell
      accent="#22d3ee"
      title="Camera"
      icon={<Camera size={16} />}
      status={active ? "running" : error ? "error" : "idle"}
      selected={selected}
      width={360}
    >
      {/* Video Preview */}
      <div
        className="relative rounded-lg overflow-hidden mb-4"
        style={{
          background: "#0a0a0f",
          aspectRatio: "4/3",
        }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          style={{ display: active ? "block" : "none" }}
        />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera size={40} className="text-slate-600" />
          </div>
        )}
        {active && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-xs text-cyan-400 px-2 py-1 rounded font-mono">
            {fps} FPS &middot; #{frameCount}
          </div>
        )}
      </div>

      {/* Device Picker */}
      {devices.length > 1 && (
        <div className="mb-3">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={active}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-md px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500/40 nodrag nowheel disabled:opacity-50"
          >
            <option value="">Default Camera</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* FPS Slider */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-slate-500 w-8">FPS</span>
        <input
          type="range"
          min={1}
          max={15}
          value={fps}
          onChange={(e) => {
            const v = Number(e.target.value);
            setFps(v);
            if (captureRef.current) captureRef.current.fps = v;
          }}
          className="flex-1 h-1.5 accent-cyan-400 nodrag nowheel"
        />
        <span className="text-xs text-slate-400 font-mono w-6 text-right">
          {fps}
        </span>
      </div>

      {/* Controls */}
      <button
        onClick={active ? stopCapture : startCapture}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors nodrag"
        style={{
          background: active ? "#ef444420" : "#22d3ee15",
          color: active ? "#ef4444" : "#22d3ee",
          border: `1px solid ${active ? "#ef444430" : "#22d3ee25"}`,
        }}
      >
        {active ? <Square size={14} /> : <Play size={14} />}
        {active ? "Stop" : "Start Capture"}
      </button>

      {error && (
        <p className="text-xs text-red-400 mt-3">{error}</p>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="frames"
        data-tooltip="frames"
        style={{
          background: "#22d3ee",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
