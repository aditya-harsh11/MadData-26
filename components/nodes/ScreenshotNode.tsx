"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { Aperture, Download, Camera } from "lucide-react";
import NodeShell from "./NodeShell";
import { useUpstreamTrigger } from "@/lib/useUpstreamTrigger";
import { useFrameStore } from "@/lib/frameStore";

export default function ScreenshotNode({ id, selected }: NodeProps) {
  const [savedCount, setSavedCount] = useState(0);
  const [lastThumbnail, setLastThumbnail] = useState<string | null>(null);
  const [triggerCount, setTriggerCount] = useState(0);
  const lastSaveRef = useRef<number>(0);

  const { sourceOutput, sourceVersion } = useUpstreamTrigger(id, "trigger");
  const edges = useEdges();

  // Find connected camera/video node
  const cameraSourceId = useMemo(() => {
    const edge = edges.find((e) => e.target === id && e.targetHandle === "camera");
    return edge?.source ?? null;
  }, [edges, id]);

  const captureScreenshot = useCallback(() => {
    if (!cameraSourceId) return;
    const frame = useFrameStore.getState().getFrame(cameraSourceId);
    if (!frame) return;

    // Cooldown: min 2s between auto-saves
    const now = Date.now();
    if (now - lastSaveRef.current < 2000) return;
    lastSaveRef.current = now;

    setLastThumbnail(`data:image/jpeg;base64,${frame}`);
    setSavedCount((c) => c + 1);

    // Download via temp anchor
    const a = document.createElement("a");
    a.href = `data:image/jpeg;base64,${frame}`;
    a.download = `arcflow-screenshot-${Date.now()}.jpg`;
    a.click();
  }, [cameraSourceId]);

  // Trigger on upstream change
  useEffect(() => {
    if (!sourceOutput || sourceVersion === 0) return;
    setTriggerCount((c) => c + 1);
    captureScreenshot();
  }, [sourceVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <NodeShell
      accent="#06b6d4"
      title="Screenshot"
      icon={<Aperture size={16} />}
      status={triggerCount > 0 ? "running" : "idle"}
      selected={selected}
      width={340}
    >
      {/* Camera input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="camera"
        data-tooltip="camera"
        style={{ background: "#22d3ee", border: "2px solid #13131a", top: "35%" }}
      />
      {/* Trigger input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        data-tooltip="trigger"
        style={{ background: "#f59e0b", border: "2px solid #13131a", top: "65%" }}
      />


      {/* Connection status */}
      {!cameraSourceId && (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded-md" style={{ background: "#0a0a0f", border: "1px solid #1e1e2e" }}>
          <Camera size={14} className="text-slate-600" />
          <span className="text-xs text-slate-500">Connect a camera or video source</span>
        </div>
      )}

      {/* Last capture thumbnail */}
      {lastThumbnail && (
        <div className="relative rounded-lg overflow-hidden mb-3" style={{ aspectRatio: "16/9", background: "#0a0a0f" }}>
          <img src={lastThumbnail} alt="Last capture" className="w-full h-full object-cover" />
          <div className="absolute top-1.5 left-1.5 bg-black/70 text-[9px] text-cyan-400 px-1.5 py-0.5 rounded font-mono">
            Last capture
          </div>
        </div>
      )}

      {/* Manual capture button */}
      <button
        onClick={() => {
          lastSaveRef.current = 0; // reset cooldown for manual
          captureScreenshot();
        }}
        disabled={!cameraSourceId}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-colors nodrag disabled:opacity-40"
        style={{ background: "#06b6d415", color: "#06b6d4", border: "1px solid #06b6d425" }}
      >
        <Download size={12} />
        Capture Now
      </button>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-mono text-cyan-500/70">{savedCount} saved</span>
        <span className="text-xs font-mono text-slate-500">{triggerCount} triggers</span>
      </div>
    </NodeShell>
  );
}
