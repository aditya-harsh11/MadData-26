"use client";

import React from "react";
import {
  Camera,
  Eye,
  Brain,
  Filter,
  MessageSquare,
  Zap,
  Cpu,
  Wifi,
  WifiOff,
} from "lucide-react";
import { NODE_CATALOG, type NodeTypeInfo } from "@/lib/types";

const iconMap: Record<string, React.ReactNode> = {
  Camera: <Camera size={16} />,
  Eye: <Eye size={16} />,
  Brain: <Brain size={16} />,
  Filter: <Filter size={16} />,
  MessageSquare: <MessageSquare size={16} />,
  Zap: <Zap size={16} />,
};

const categoryLabels: Record<string, string> = {
  input: "Input",
  processing: "Processing",
  ai: "AI Models",
  output: "Output",
};

interface SidebarProps {
  backendConnected: boolean;
}

export default function Sidebar({ backendConnected }: SidebarProps) {
  const grouped = NODE_CATALOG.reduce(
    (acc, node) => {
      if (!acc[node.category]) acc[node.category] = [];
      acc[node.category].push(node);
      return acc;
    },
    {} as Record<string, NodeTypeInfo[]>
  );

  const onDragStart = (
    event: React.DragEvent,
    nodeType: string
  ) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside
      className="flex flex-col h-full border-r"
      style={{
        width: 220,
        background: "#0d0d14",
        borderColor: "#1e1e2e",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 py-4 border-b"
        style={{ borderColor: "#1e1e2e" }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{
            background: "linear-gradient(135deg, #22d3ee20, #a855f720)",
            border: "1px solid #22d3ee30",
          }}
        >
          <Cpu size={16} className="text-cyan-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-200 tracking-tight">
            SnapFlow
          </h1>
          <p className="text-[9px] text-slate-500 font-mono">
            Qualcomm NPU Pipeline
          </p>
        </div>
      </div>

      {/* Node Palette */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {Object.entries(grouped).map(([category, nodes]) => (
          <div key={category}>
            <h2 className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-2 px-1">
              {categoryLabels[category]}
            </h2>
            <div className="space-y-1">
              {nodes.map((node) => (
                <div
                  key={node.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type)}
                  className="sidebar-node-drag flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all hover:scale-[1.02]"
                  style={{
                    background: "#13131a",
                    border: "1px solid #1e1e2e",
                    cursor: "grab",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      node.accent + "40";
                    (e.currentTarget as HTMLElement).style.background =
                      node.accent + "08";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "#1e1e2e";
                    (e.currentTarget as HTMLElement).style.background =
                      "#13131a";
                  }}
                >
                  <div
                    className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0"
                    style={{
                      background: node.accent + "15",
                      color: node.accent,
                    }}
                  >
                    {iconMap[node.icon]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-300 truncate">
                      {node.label}
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">
                      {node.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Status Bar */}
      <div
        className="px-4 py-3 border-t flex items-center gap-2"
        style={{ borderColor: "#1e1e2e" }}
      >
        {backendConnected ? (
          <>
            <Wifi size={12} className="text-emerald-400" />
            <span className="text-[10px] text-emerald-400 font-medium">
              Backend Connected
            </span>
          </>
        ) : (
          <>
            <WifiOff size={12} className="text-red-400" />
            <span className="text-[10px] text-red-400 font-medium">
              Disconnected
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
