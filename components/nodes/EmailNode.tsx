"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Mail, WifiOff } from "lucide-react";
import NodeShell from "./NodeShell";
import { useUpstreamTrigger } from "@/lib/useUpstreamTrigger";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { pipelineSocket } from "@/lib/websocket";

export default function EmailNode({ id, selected, data }: NodeProps) {
  const [emailTo, setEmailTo] = useState(data?.emailTo || "");
  const [subject, setSubject] = useState(data?.emailSubject || "arcflow Alert");
  const [bodyTemplate, setBodyTemplate] = useState(data?.emailBody || "{{output}}");
  const [triggerCount, setTriggerCount] = useState(0);
  const [lastStatus, setLastStatus] = useState<"success" | "error" | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastTime, setLastTime] = useState<string | null>(null);

  const { sourceOutput, sourceVersion } = useUpstreamTrigger(id, "trigger");
  const online = useOnlineStatus();

  // Sync from data prop
  useEffect(() => {
    if (data?.emailTo != null) setEmailTo(data.emailTo);
    if (data?.emailSubject != null) setSubject(data.emailSubject);
    if (data?.emailBody != null) setBodyTemplate(data.emailBody);
  }, [data?.emailTo, data?.emailSubject, data?.emailBody]);

  // Listen for email results
  const handleResult = useCallback(
    (payload: any) => {
      if (payload.node_id !== id) return;
      setLastTime(new Date().toLocaleTimeString());
      if (payload.success) {
        setLastStatus("success");
        setLastError(null);
      } else {
        setLastStatus("error");
        setLastError(payload.error || "Unknown error");
      }
    },
    [id]
  );

  useEffect(() => {
    pipelineSocket.on("email_result", handleResult);
    return () => {
      pipelineSocket.off("email_result", handleResult);
    };
  }, [handleResult]);

  // Trigger on upstream change
  useEffect(() => {
    if (!sourceOutput || sourceVersion === 0) return;
    setTriggerCount((c) => c + 1);

    if (!online) {
      setLastStatus("error");
      setLastError("No internet connection");
      setLastTime(new Date().toLocaleTimeString());
      return;
    }

    if (!emailTo) {
      setLastStatus("error");
      setLastError("No recipient set");
      setLastTime(new Date().toLocaleTimeString());
      return;
    }

    const body = bodyTemplate.includes("{{output}}")
      ? bodyTemplate.replace(/\{\{output\}\}/g, sourceOutput)
      : bodyTemplate;
    pipelineSocket.sendEmail(emailTo, subject, body, id);
  }, [sourceVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor =
    lastStatus === null ? "#64748b" : lastStatus === "success" ? "#10b981" : "#ef4444";

  return (
    <NodeShell
      accent="#3b82f6"
      title="Email"
      icon={<Mail size={16} />}
      status={triggerCount > 0 ? "running" : "idle"}
      selected={selected}
      width={340}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="trigger"
        data-tooltip="trigger"
        style={{ background: "#f59e0b", border: "2px solid #13131a" }}
      />

      {/* Offline banner */}
      {!online && (
        <div
          className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md"
          style={{ background: "#ef444415", border: "1px solid #ef444425" }}
        >
          <WifiOff size={14} className="text-red-400" />
          <span className="text-xs text-red-400 font-medium">No Internet — emails disabled</span>
        </div>
      )}

      {/* Recipient */}
      <div className="mb-3">
        <span className="text-xs text-slate-500 block mb-1.5">Recipient</span>
        <input
          type="email"
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          disabled={!online}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-blue-500/40 font-mono nodrag nowheel disabled:opacity-40"
          placeholder="name@example.com"
        />
      </div>

      {/* Subject */}
      <div className="mb-3">
        <span className="text-xs text-slate-500 block mb-1.5">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!online}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-blue-500/40 nodrag nowheel disabled:opacity-40"
          placeholder="arcflow Alert"
        />
      </div>

      {/* Body */}
      <div className="mb-3">
        <span className="text-xs text-slate-500 block mb-1.5">
          Body <span className="text-slate-600">{'({{output}} = trigger text)'}</span>
        </span>
        <textarea
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          disabled={!online}
          rows={3}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-blue-500/40 font-mono nodrag nowheel disabled:opacity-40 resize-none"
          placeholder="Alert: {{output}}"
        />
      </div>

      {/* Last status */}
      {lastStatus !== null && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2 mb-3"
          style={{
            background: statusColor + "15",
            border: `1px solid ${statusColor}25`,
          }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
          <span className="text-xs font-mono" style={{ color: statusColor }}>
            {lastStatus === "success" ? "Sent" : lastError || "Error"}
          </span>
          {lastTime && (
            <span className="text-[10px] text-slate-500 ml-auto font-mono">{lastTime}</span>
          )}
        </div>
      )}

      {!emailTo && !lastStatus && (
        <div className="rounded-lg p-3" style={{ background: "#0a0a0f" }}>
          <p className="text-xs text-slate-600 text-center">Enter a recipient email address</p>
        </div>
      )}

      <div className="mt-3 text-right">
        <span className="text-xs font-mono text-blue-500/70">{triggerCount} triggers</span>
      </div>
    </NodeShell>
  );
}
