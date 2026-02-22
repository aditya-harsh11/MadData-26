"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Camera, Play, Square } from "lucide-react";
import NodeShell from "./NodeShell";
import { FrameCapture } from "@/lib/frameCapture";
import { pipelineSocket } from "@/lib/websocket";

export default function WebcamInputNode({ id, selected }: NodeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureRef = useRef<FrameCapture | null>(null);
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState(3);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      const capture = new FrameCapture({ fps, width: 1280, height: 720 });
      const stream = await capture.init();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      capture.startCapture((base64) => {
        setFrameCount((c) => c + 1);
        pipelineSocket.sendFrame(base64, id);
      });

      captureRef.current = capture;
      setActive(true);
    } catch (err: any) {
      setError(err.message || "Camera access denied");
    }
  }, [fps, id]);

  const stopCapture = useCallback(() => {
    captureRef.current?.destroy();
    captureRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActive(false);
  }, []);

  useEffect(() => {
    return () => {
      captureRef.current?.destroy();
    };
  }, []);

  return (
    <NodeShell
      accent="#22d3ee"
      title="Webcam Input"
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
        style={{
          background: "#22d3ee",
          border: "2px solid #13131a",
        }}
      />
    </NodeShell>
  );
}
