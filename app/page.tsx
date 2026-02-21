"use client";

import { ReactFlowProvider } from "reactflow";
import Canvas from "@/components/Canvas";

export default function Home() {
  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen overflow-hidden bg-surface">
        <Canvas />
      </div>
    </ReactFlowProvider>
  );
}
