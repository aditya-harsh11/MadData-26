"use client";

import React from "react";
import { ArrowRight, Shield, Cpu, GitBranch, Eye, Mic } from "lucide-react";

interface LandingPageProps {
  onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col items-center justify-center relative"
      style={{ background: "#0a0a0f", WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Background grid effect */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, #1a1a2e 1px, transparent 0)",
        backgroundSize: "40px 40px",
        opacity: 0.5,
      }} />

      {/* Glow orbs */}
      <div className="absolute pointer-events-none" style={{
        width: 500, height: 500,
        top: "20%", left: "30%",
        background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
        filter: "blur(60px)",
      }} />
      <div className="absolute pointer-events-none" style={{
        width: 400, height: 400,
        bottom: "20%", right: "25%",
        background: "radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)",
        filter: "blur(60px)",
      }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 max-w-2xl px-8 animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #22d3ee15, #a855f715)",
              border: "1px solid #22d3ee20",
              boxShadow: "0 0 40px rgba(34,211,238,0.08), 0 0 80px rgba(168,85,247,0.05)",
            }}
          >
            <GitBranch size={28} className="text-cyan-400" />
          </div>
          <h1
            className="text-5xl font-bold tracking-tight"
            style={{
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 700,
              color: "#e2e8f0",
            }}
          >
            arcflow
          </h1>
          <p className="text-lg text-slate-400 text-center leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
            Visual AI pipeline editor for smart cameras and audio.
            <br />
            <span className="text-slate-500">Drag. Drop. Deploy. All on the edge.</span>
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { icon: <Eye size={14} />, label: "Vision AI", color: "#a855f7" },
            { icon: <Mic size={14} />, label: "Audio AI", color: "#ec4899" },
            { icon: <Shield size={14} />, label: "Privacy-first", color: "#10b981" },
            { icon: <Cpu size={14} />, label: "On-device NPU", color: "#22d3ee" },
          ].map((feat) => (
            <div
              key={feat.label}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
              style={{
                background: `${feat.color}0a`,
                border: `1px solid ${feat.color}20`,
                color: feat.color,
              }}
            >
              {feat.icon}
              {feat.label}
            </div>
          ))}
        </div>

        {/* Enter button */}
        <button
          onClick={onEnter}
          className="group flex items-center gap-3 px-8 py-3.5 rounded-xl text-base font-semibold transition-all hover:scale-[1.03] active:scale-[0.98] mt-4"
          style={{
            background: "linear-gradient(135deg, #22d3ee18, #a855f718)",
            border: "1px solid #22d3ee30",
            color: "#e2e8f0",
            boxShadow: "0 0 30px rgba(34,211,238,0.08)",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          Open Editor
          <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </button>

        {/* Subtle tagline */}
        <p className="text-xs text-slate-600 mt-2">
          Drag nodes. Wire pipelines. No cloud needed.
        </p>
      </div>
    </div>
  );
}
