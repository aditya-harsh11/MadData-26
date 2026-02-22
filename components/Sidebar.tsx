"use client";

import React from "react";
import {
  Camera,
  Eye,
  GitBranch,
  MessageSquare,
  ScanSearch,
  Cpu,
  Wifi,
  WifiOff,
  Mic,
  AudioLines,
  Ear,
  Film,
  Volume2,
  FileText,
  Bell,
  Aperture,
  Webhook,
  Mail,
  MessageCircle,
  Music,
} from "lucide-react";
import { NODE_CATALOG, type NodeTypeInfo } from "@/lib/types";

const iconMap: Record<string, React.ReactNode> = {
  Camera: <Camera size={18} />,
  ScanSearch: <ScanSearch size={18} />,
  Eye: <Eye size={18} />,
  GitBranch: <GitBranch size={18} />,
  MessageSquare: <MessageSquare size={18} />,
  Mic: <Mic size={18} />,
  AudioLines: <AudioLines size={18} />,
  Ear: <Ear size={18} />,
  Film: <Film size={18} />,
  Volume2: <Volume2 size={18} />,
  FileText: <FileText size={18} />,
  Bell: <Bell size={18} />,
  Aperture: <Aperture size={18} />,
  Webhook: <Webhook size={18} />,
  Mail: <Mail size={18} />,
  MessageCircle: <MessageCircle size={18} />,
  Music: <Music size={18} />,
};

const categoryLabels: Record<string, string> = {
  input: "Input",
  ai: "AI Models",
  logic: "Logic",
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
        width: 280,
        minWidth: 280,
        background: "#0d0d14",
        borderColor: "#1e1e2e",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5 border-b"
        style={{ borderColor: "#1e1e2e", WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            background: "linear-gradient(135deg, #22d3ee20, #a855f720)",
            border: "1px solid #22d3ee30",
          }}
        >
          <Cpu size={20} className="text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-200 tracking-tight" style={{ fontFamily: "'Urbanist', sans-serif" }}>
            arcflow
          </h1>
          <p className="text-[11px] text-slate-500 font-mono">
            visual AI pipeline editor
          </p>
        </div>
      </div>

      {/* Node Palette */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {Object.entries(grouped).map(([category, nodes]) => (
          <div key={category}>
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2.5 px-1">
              {categoryLabels[category]}
            </h2>
            <div className="space-y-1.5">
              {nodes.map((node) => (
                <div
                  key={node.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type)}
                  className="sidebar-node-drag flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:scale-[1.02]"
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
                    className="flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0"
                    style={{
                      background: node.accent + "15",
                      color: node.accent,
                    }}
                  >
                    {iconMap[node.icon]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-300 truncate">
                      {node.label}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
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
        className="px-5 py-4 border-t flex items-center gap-2.5"
        style={{ borderColor: "#1e1e2e" }}
      >
        {backendConnected ? (
          <>
            <Wifi size={16} className="text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">
              Backend Connected
            </span>
          </>
        ) : (
          <>
            <WifiOff size={16} className="text-red-400" />
            <span className="text-sm text-red-400 font-medium">
              Disconnected
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
