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
import CameraNode from "./nodes/CameraNode";
import VisualLlmNode from "./nodes/VisualLlmNode";
import LogicNode from "./nodes/LogicNode";
import LlmNode from "./nodes/LlmNode";
import ActionNode from "./nodes/ActionNode";
import { pipelineSocket } from "@/lib/websocket";

const nodeTypes = {
  camera: CameraNode,
  visualLlm: VisualLlmNode,
  logic: LogicNode,
  llm: LlmNode,
  action: ActionNode,
};

const VALID_NODE_TYPES = new Set<string>(Object.keys(nodeTypes));

const defaultNodes: Node[] = [
  {
    id: "camera-1",
    type: "camera",
    position: { x: 50, y: 200 },
    data: {},
  },
  {
    id: "vlm-1",
    type: "visualLlm",
    position: { x: 500, y: 150 },
    data: {
      prompt:
        "Describe any safety concerns you see. Mention if anyone is not wearing required safety gear.",
      interval: 10,
    },
  },
  {
    id: "logic-1",
    type: "logic",
    position: { x: 1020, y: 180 },
    data: {
      conditions: [
        { id: "1", operator: "contains", value: "danger" },
        { id: "2", operator: "contains", value: "hazard" },
        { id: "3", operator: "contains", value: "unsafe" },
      ],
      mode: "any",
    },
  },
  {
    id: "action-1",
    type: "action",
    position: { x: 1500, y: 200 },
    data: { actionType: "log" },
  },
];

const defaultEdges: Edge[] = [
  {
    id: "e-camera-vlm",
    source: "camera-1",
    sourceHandle: "frames",
    target: "vlm-1",
    targetHandle: "camera",
    animated: true,
    style: { stroke: "#22d3ee50" },
  },
  {
    id: "e-vlm-logic",
    source: "vlm-1",
    sourceHandle: "response",
    target: "logic-1",
    targetHandle: "input",
    animated: true,
    style: { stroke: "#a855f750" },
  },
  {
    id: "e-logic-action",
    source: "logic-1",
    sourceHandle: "match",
    target: "action-1",
    targetHandle: "trigger",
    animated: true,
    style: { stroke: "#10b98150" },
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
  const [workflowInput, setWorkflowInput] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Connect to backend WebSocket
  useEffect(() => {
    pipelineSocket.connect();

    const statusHandler = (data: any) => {
      setBackendConnected(data.connected);
    };
    pipelineSocket.on("status", statusHandler);

    const generatedHandler = (data: {
      nodes?: { id: string; type: string; data?: Record<string, any> }[];
      edges?: {
        source: string;
        target: string;
        sourceHandle?: string;
        targetHandle?: string;
      }[];
      error?: string | null;
    }) => {
      setGenerateLoading(false);
      setGenerateError(data.error ?? null);
      if (data.nodes?.length && !data.error) {
        const spacing = 380;
        const validNodes = data.nodes.filter((n) =>
          VALID_NODE_TYPES.has(n.type)
        );
        const newNodes: Node[] = validNodes.map((n, i) => ({
          id: n.id,
          type: n.type,
          position: { x: 50 + i * spacing, y: 200 },
          data: n.data || {},
        }));
        const nodeIds = new Set(newNodes.map((n) => n.id));
        const newEdges: Edge[] = (data.edges || [])
          .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
          .map((e, i) => ({
            id: `e-${e.source}-${e.target}-${i}`,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            animated: true,
            style: { stroke: "#2a2a3a" },
          }));
        setNodes(newNodes);
        setEdges(newEdges);
      }
    };
    pipelineSocket.on("workflow_generated", generatedHandler);

    return () => {
      pipelineSocket.off("status", statusHandler);
      pipelineSocket.off("workflow_generated", generatedHandler);
      pipelineSocket.disconnect();
    };
  }, [setNodes, setEdges]);

  const generateWorkflow = useCallback(() => {
    if (!backendConnected || !workflowInput.trim()) return;
    setGenerateLoading(true);
    setGenerateError(null);
    pipelineSocket.sendGenerateWorkflow(workflowInput.trim());
  }, [backendConnected, workflowInput]);

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
          <div className="flex items-center gap-2 flex-1 max-w-2xl">
            <input
              type="text"
              placeholder="Describe a workflow (e.g. monitor my desk for a coffee cup and alert me)"
              value={workflowInput}
              onChange={(e) => setWorkflowInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateWorkflow()}
              disabled={!backendConnected || generateLoading}
              className="nodrag flex-1 min-w-0 px-3 py-1.5 rounded-md text-xs bg-[#13131a] border text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:border-[#a855f760]"
              style={{ borderColor: "#1e1e2e" }}
            />
            <button
              type="button"
              onClick={generateWorkflow}
              disabled={
                !backendConnected ||
                generateLoading ||
                !workflowInput.trim()
              }
              className="nodrag flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity disabled:opacity-50"
              style={{
                background: "#a855f718",
                color: "#a855f7",
                border: "1px solid #a855f740",
              }}
            >
              {generateLoading ? "Generating..." : "Generate workflow"}
            </button>
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

        {generateError && (
          <div className="absolute top-11 left-4 right-4 z-20 nodrag px-3 py-2 rounded-md text-xs text-red-400 border border-red-500/30 bg-red-950/30">
            {generateError}
          </div>
        )}

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
          <Controls showInteractive={false} position="bottom-right" />
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
                camera: "#22d3ee",
                visualLlm: "#a855f7",
                logic: "#f59e0b",
                llm: "#3b82f6",
                action: "#10b981",
              };
              return colors[node.type || ""] || "#64748b";
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
