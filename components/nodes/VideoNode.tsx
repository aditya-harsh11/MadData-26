"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Film, Play, Square, Upload } from "lucide-react";
import NodeShell from "./NodeShell";
import { useFrameStore } from "@/lib/frameStore";
import { useWorkflowStore } from "@/lib/workflowStore";
import { useNodeData } from "@/lib/useNodeData";
import {
  isSwitching,
  getSwitchFromWorkflowId,
  parkCapture,
  reclaimCapture,
} from "@/lib/captureRegistry";

export default function VideoNode({ id, selected, data }: NodeProps) {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detached elements for capture (survive unmount)
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Refs for cleanup closure access (avoids stale closures)
  const activeRef = useRef(false);
  const fpsRef = useRef(data?.fps ?? 3);
  const fileNameRef = useRef<string | null>(null);

  const [hasVideo, setHasVideo] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState(data?.fps ?? 3);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { fpsRef.current = fps; }, [fps]);
  useEffect(() => { fileNameRef.current = fileName; }, [fileName]);

  const updateData = useNodeData(id);
  useEffect(() => {
    updateData({ fps });
  }, [fps, updateData]);

  // ── Combined reclaim + cleanup effect ──
  useEffect(() => {
    // Try to reclaim parked capture on mount
    const wfId = useWorkflowStore.getState().activeWorkflowId;
    if (wfId) {
      const parked = reclaimCapture(wfId, id);
      if (parked && parked.type === "video") {
        // Restore detached elements
        captureVideoRef.current = parked.video;
        captureCanvasRef.current = parked.canvas;
        captureCtxRef.current = parked.ctx;
        objectUrlRef.current = parked.objectUrl;

        setFileName(parked.fileName);
        setFps(parked.fps);
        setHasVideo(true);

        // Clean up namespaced frame key
        useFrameStore.getState().removeFrame(`${wfId}::${id}`);

        // Stop old interval
        if (parked.intervalId) clearInterval(parked.intervalId);

        if (parked.active) {
          // Restart interval with plain key
          const video = parked.video;
          const ctx = parked.ctx;
          const canvas = parked.canvas;
          intervalRef.current = setInterval(() => {
            if (video.paused || video.ended) return;
            ctx.drawImage(video, 0, 0, 1280, 720);
            const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
            setFrameCount((c) => c + 1);
            useFrameStore.getState().setFrame(id, base64);
          }, 1000 / parked.fps);

          setActive(true);
        }

        // Set preview video to same source
        if (previewVideoRef.current) {
          previewVideoRef.current.src = parked.objectUrl;
          previewVideoRef.current.currentTime = parked.video.currentTime;
          if (parked.active) {
            previewVideoRef.current.play().catch(() => {});
          }
        }
      }
    }

    // Cleanup: always re-park instead of destroying.
    // Handles workflow switches, React strict mode, and node deletion.
    return () => {
      if (!captureVideoRef.current || !objectUrlRef.current) return;

      const parkWfId = isSwitching()
        ? getSwitchFromWorkflowId()
        : useWorkflowStore.getState().activeWorkflowId;

      if (parkWfId && captureCanvasRef.current && captureCtxRef.current) {
        // Remove plain frame key
        useFrameStore.getState().removeFrame(id);

        // Stop current interval
        if (intervalRef.current) clearInterval(intervalRef.current);

        const video = captureVideoRef.current;
        const canvas = captureCanvasRef.current;
        const ctx = captureCtxRef.current;
        const currentFps = fpsRef.current;
        const wasActive = activeRef.current;
        const currentFileName = fileNameRef.current;

        // Start new interval with namespaced key (only if was active)
        let parkInterval: ReturnType<typeof setInterval> | null = null;
        if (wasActive) {
          parkInterval = setInterval(() => {
            if (video.paused || video.ended) return;
            ctx.drawImage(video, 0, 0, 1280, 720);
            const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
            useFrameStore.getState().setFrame(`${parkWfId}::${id}`, base64);
          }, 1000 / currentFps);
        }

        parkCapture(parkWfId, id, {
          type: "video",
          video,
          canvas,
          ctx,
          intervalId: parkInterval,
          objectUrl: objectUrlRef.current,
          fileName: currentFileName || "",
          fps: currentFps,
          active: wasActive,
          nodeId: id,
          workflowId: parkWfId,
        });

        // Clear refs so they don't get cleaned up below
        captureVideoRef.current = null;
        captureCanvasRef.current = null;
        captureCtxRef.current = null;
        objectUrlRef.current = null;
        intervalRef.current = null;
      } else {
        // No workflow to park under — full cleanup
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (captureVideoRef.current) {
          captureVideoRef.current.pause();
          captureVideoRef.current.removeAttribute("src");
          captureVideoRef.current.load();
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        useFrameStore.getState().removeFrame(id);

        captureVideoRef.current = null;
        captureCanvasRef.current = null;
        captureCtxRef.current = null;
        objectUrlRef.current = null;
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Revoke old URL
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

      // Clean up old detached elements
      if (captureVideoRef.current) {
        captureVideoRef.current.pause();
        captureVideoRef.current.removeAttribute("src");
        captureVideoRef.current.load();
      }

      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setFileName(file.name);
      setError(null);
      setFrameCount(0);
      setHasVideo(true);

      // Create detached video for capture
      const captureVideo = document.createElement("video");
      captureVideo.src = url;
      captureVideo.loop = true;
      captureVideo.muted = true;
      captureVideo.playsInline = true;
      captureVideo.load();
      captureVideoRef.current = captureVideo;

      // Create detached canvas for frame extraction
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      captureCanvasRef.current = canvas;
      captureCtxRef.current = ctx;

      // Set preview video
      if (previewVideoRef.current) {
        previewVideoRef.current.src = url;
        previewVideoRef.current.load();
      }
    },
    []
  );

  const startCapture = useCallback(() => {
    if (!captureVideoRef.current || !objectUrlRef.current) {
      setError("Select a video file first");
      return;
    }

    setError(null);
    const video = captureVideoRef.current;
    video.play().catch(() => setError("Could not play video"));

    // Also play preview
    if (previewVideoRef.current) {
      previewVideoRef.current.play().catch(() => {});
    }

    const ctx = captureCtxRef.current;
    const canvas = captureCanvasRef.current;
    if (!ctx || !canvas) return;

    intervalRef.current = setInterval(() => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, 1280, 720);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      setFrameCount((c) => c + 1);
      useFrameStore.getState().setFrame(id, base64);
    }, 1000 / fps);

    setActive(true);
  }, [fps, id]);

  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (captureVideoRef.current) {
      captureVideoRef.current.pause();
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
    }
    setActive(false);
    useFrameStore.getState().removeFrame(id);
  }, [id]);

  // Update interval when fps changes while active
  useEffect(() => {
    if (!active || !captureVideoRef.current || !captureCanvasRef.current || !captureCtxRef.current) return;

    if (intervalRef.current) clearInterval(intervalRef.current);

    const video = captureVideoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = captureCtxRef.current;

    intervalRef.current = setInterval(() => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, 1280, 720);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      setFrameCount((c) => c + 1);
      useFrameStore.getState().setFrame(id, base64);
    }, 1000 / fps);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fps, active, id]);

  return (
    <NodeShell
      accent="#22d3ee"
      title="Video Input"
      icon={<Film size={16} />}
      status={active ? "running" : error ? "error" : "idle"}
      selected={selected}
      width={360}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={onFileSelect}
        className="hidden"
      />

      {/* Video Preview */}
      <div
        className="relative rounded-lg overflow-hidden mb-4"
        style={{
          background: "#0a0a0f",
          aspectRatio: "4/3",
        }}
      >
        <video
          ref={previewVideoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          loop
          style={{ display: hasVideo ? "block" : "none" }}
        />
        {!hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Film size={40} className="text-slate-600" />
            <span className="text-xs text-slate-500">No video selected</span>
          </div>
        )}
        {hasVideo && (
          <div className="absolute top-2 left-2 bg-black/70 text-[10px] text-cyan-400/70 px-2 py-0.5 rounded font-mono">
            Video input — simulating camera for demo
          </div>
        )}
        {active && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-xs text-cyan-400 px-2 py-1 rounded font-mono">
            {fps} FPS &middot; #{frameCount}
          </div>
        )}
      </div>

      {/* File name */}
      {fileName && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-slate-400 truncate flex-1 font-mono">
            {fileName}
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={active}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 disabled:opacity-40 nodrag"
          >
            Change
          </button>
        </div>
      )}

      {/* File picker button (when no file selected) */}
      {!fileName && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors mb-4 nodrag"
          style={{
            background: "#22d3ee10",
            color: "#22d3ee",
            border: "1px solid #22d3ee25",
          }}
        >
          <Upload size={14} />
          Select Video File
        </button>
      )}

      {/* FPS Slider */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-slate-500 w-8">FPS</span>
        <input
          type="range"
          min={1}
          max={15}
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          className="flex-1 h-1.5 accent-cyan-400 nodrag nowheel"
        />
        <span className="text-xs text-slate-400 font-mono w-6 text-right">
          {fps}
        </span>
      </div>

      {/* Controls */}
      <button
        onClick={active ? stopCapture : startCapture}
        disabled={!hasVideo}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors nodrag disabled:opacity-40"
        style={{
          background: active ? "#ef444420" : "#22d3ee15",
          color: active ? "#ef4444" : "#22d3ee",
          border: `1px solid ${active ? "#ef444430" : "#22d3ee25"}`,
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
