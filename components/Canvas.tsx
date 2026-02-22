"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

import Sidebar from "./Sidebar";
import WebcamInputNode from "./nodes/WebcamInputNode";
import WatchdogNode from "./nodes/WatchdogNode";
import ReasoningBrainNode from "./nodes/ReasoningBrainNode";
import ActionNode from "./nodes/ActionNode";
import TextGenNode from "./nodes/TextGenNode";
import FilterNode from "./nodes/FilterNode";
import { pipelineSocket } from "@/lib/websocket";

const nodeTypes = {
  webcamInput: WebcamInputNode,
  watchdog: WatchdogNode,
  reasoningBrain: ReasoningBrainNode,
  action: ActionNode,
  textGen: TextGenNode,
  filter: FilterNode,
};

const defaultNodes: Node[] = [
  {
    id: "webcam-1",
    type: "webcamInput",
    position: { x: 50, y: 200 },
    data: {},
  },
  {
    id: "watchdog-1",
    type: "watchdog",
    position: { x: 500, y: 180 },
    data: {},
  },
  {
    id: "brain-1",
    type: "reasoningBrain",
    position: { x: 960, y: 150 },
    data: {},
  },
  {
    id: "action-1",
    type: "action",
    position: { x: 1460, y: 180 },
    data: {},
  },
];

const defaultEdges: Edge[] = [
  {
    id: "e-webcam-watchdog",
    source: "webcam-1",
    sourceHandle: "frames",
    target: "watchdog-1",
    targetHandle: "frames",
    animated: true,
    style: { stroke: "#22d3ee50" },
  },
  {
    id: "e-watchdog-brain",
    source: "watchdog-1",
    sourceHandle: "triggered",
    target: "brain-1",
    targetHandle: "trigger",
    animated: true,
    style: { stroke: "#ef444450" },
  },
  {
    id: "e-brain-action",
    source: "brain-1",
    sourceHandle: "analysis",
    target: "action-1",
    targetHandle: "input",
    animated: true,
    style: { stroke: "#a855f750" },
  },
];

let nodeId = 100;
const getNewId = () => `node-${nodeId++}`;

export default function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [backendConnected, setBackendConnected] = useState(false);

  // Connect to backend WebSocket
  useEffect(() => {
    pipelineSocket.connect();

    const handler = (data: any) => {
      setBackendConnected(data.connected);
    };
    pipelineSocket.on("status", handler);

    return () => {
      pipelineSocket.off("status", handler);
      pipelineSocket.disconnect();
    };
  }, []);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#2a2a3a" },
          },
          eds
        )
      ),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node = {
        id: getNewId(),
        type,
        position,
        data: {},
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <div className="flex h-full w-full">
      <Sidebar backendConnected={backendConnected} />

      <div className="flex-1 relative" ref={reactFlowWrapper}>
        {/* Top Bar */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2"
          style={{
            background:
              "linear-gradient(180deg, #0a0a0fcc 0%, transparent 100%)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">
              Pipeline Editor
            </span>
            <span className="text-[9px] text-slate-600 font-mono">
              {nodes.length} nodes &middot; {edges.length} connections
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium"
              style={{
                background: backendConnected ? "#10b98112" : "#ef444412",
                color: backendConnected ? "#10b981" : "#ef4444",
                border: `1px solid ${
                  backendConnected ? "#10b98120" : "#ef444420"
                }`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: backendConnected ? "#10b981" : "#ef4444",
                  boxShadow: backendConnected
                    ? "0 0 4px #10b981"
                    : undefined,
                }}
              />
              {backendConnected ? "AI Backend Online" : "Backend Offline"}
            </div>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[20, 20]}
          noDragClassName="nodrag"
          noWheelClassName="nowheel"
          defaultEdgeOptions={{
            animated: true,
            style: { strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#1a1a2e"
          />
          <Controls
            showInteractive={false}
            position="bottom-right"
          />
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            position="bottom-right"
            style={{
              marginBottom: 50,
            }}
            maskColor="rgba(10, 10, 15, 0.8)"
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                webcamInput: "#22d3ee",
                watchdog: "#f59e0b",
                reasoningBrain: "#a855f7",
                action: "#10b981",
                textGen: "#3b82f6",
                filter: "#ec4899",
              };
              return colors[node.type || ""] || "#64748b";
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
