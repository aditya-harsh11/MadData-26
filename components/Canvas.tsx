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
import { FolderOpen, ChevronLeft } from "lucide-react";

import Sidebar from "./Sidebar";
import WorkflowPanel from "./WorkflowPanel";
import { GitBranch } from "lucide-react";
import CameraNode from "./nodes/CameraNode";
import VideoNode from "./nodes/VideoNode";
import DetectionNode from "./nodes/DetectionNode";
import VisualLlmNode from "./nodes/VisualLlmNode";
import LogicNode from "./nodes/LogicNode";
import LlmNode from "./nodes/LlmNode";
import SoundAlertNode from "./nodes/SoundAlertNode";
import LogNode from "./nodes/LogNode";
import NotifyNode from "./nodes/NotifyNode";
import ScreenshotNode from "./nodes/ScreenshotNode";
import WebhookNode from "./nodes/WebhookNode";
import EmailNode from "./nodes/EmailNode";
import SmsNode from "./nodes/SmsNode";
import MicNode from "./nodes/MicNode";
import AudioDetectNode from "./nodes/AudioDetectNode";
import AudioLlmNode from "./nodes/AudioLlmNode";
import { pipelineSocket } from "@/lib/websocket";
import { useWorkflowStore, type SavedWorkflow } from "@/lib/workflowStore";
import { useFrameStore } from "@/lib/frameStore";
import { useAudioStore } from "@/lib/audioStore";
import { useNodeOutputStore } from "@/lib/nodeOutputStore";
import {
  prepareSwitch,
  completeSwitch,
  destroyWorkflowCaptures,
} from "@/lib/captureRegistry";

const nodeTypes = {
  camera: CameraNode,
  video: VideoNode,
  detection: DetectionNode,
  visualLlm: VisualLlmNode,
  logic: LogicNode,
  llm: LlmNode,
  soundAction: SoundAlertNode,
  logAction: LogNode,
  notifyAction: NotifyNode,
  screenshotAction: ScreenshotNode,
  webhookAction: WebhookNode,
  emailAction: EmailNode,
  smsAction: SmsNode,
  mic: MicNode,
  audioDetect: AudioDetectNode,
  audioLlm: AudioLlmNode,
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
    id: "detect-1",
    type: "detection",
    position: { x: 480, y: 180 },
    data: { confidence: 45, interval: 2 },
  },
  {
    id: "vlm-1",
    type: "visualLlm",
    position: { x: 900, y: 100 },
    data: {
      prompt:
        "Describe any safety concerns you see. Mention if anyone is not wearing required safety gear.",
      interval: 10,
    },
  },
  {
    id: "logic-1",
    type: "logic",
    position: { x: 1400, y: 180 },
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
    id: "log-1",
    type: "logAction",
    position: { x: 1880, y: 200 },
    data: {},
  },
];

const defaultEdges: Edge[] = [
  {
    id: "e-camera-detect",
    source: "camera-1",
    sourceHandle: "frames",
    target: "detect-1",
    targetHandle: "camera",
    animated: true,
    style: { stroke: "#22d3ee50" },
  },
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
    id: "e-detect-vlm",
    source: "detect-1",
    sourceHandle: "match",
    target: "vlm-1",
    targetHandle: "trigger",
    animated: true,
    style: { stroke: "#10b98150" },
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
    target: "log-1",
    targetHandle: "trigger",
    animated: true,
    style: { stroke: "#10b98150" },
  },
];

let nodeId = 100;
const getNewId = () => `node-${nodeId++}`;

/** Reset nodeId counter above max numeric ID found in nodes */
function syncNodeIdCounter(nodes: Node[]) {
  const maxId = nodes.reduce((max, n) => {
    const match = n.id.match(/(\d+)/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  nodeId = Math.max(nodeId, maxId + 1);
}

export default function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [backendConnected, setBackendConnected] = useState(false);
  const [workflowInput, setWorkflowInput] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [workflowPanelOpen, setWorkflowPanelOpen] = useState(false);

  // Track whether we've finished initial load (suppress autosave until then)
  const initializedRef = useRef(false);
  // Suppress autosave during workflow switches
  const suppressAutosaveRef = useRef(false);

  const {
    workflows,
    activeWorkflowId,
    loadFromStorage,
    createWorkflow,
    autosave,
    setActiveWorkflowId,
    deleteWorkflow,
    renameWorkflow,
  } = useWorkflowStore();

  // ─── Bootstrap: load workflows or create default ───
  useEffect(() => {
    loadFromStorage();
    const store = useWorkflowStore.getState();

    if (store.workflows.length === 0) {
      // First time — create default workflow
      const id = store.createWorkflow("Default Workflow", defaultNodes, defaultEdges);
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      syncNodeIdCounter(defaultNodes);
    } else {
      // Load the active workflow (or first one)
      const activeId = store.activeWorkflowId || store.workflows[0].id;
      const wf = store.workflows.find((w) => w.id === activeId) || store.workflows[0];
      if (wf) {
        setNodes(wf.nodes);
        setEdges(wf.edges);
        syncNodeIdCounter(wf.nodes);
        if (store.activeWorkflowId !== wf.id) {
          store.setActiveWorkflowId(wf.id);
        }
      }
    }

    // Mark init complete after a tick so the first setNodes/setEdges settles
    setTimeout(() => {
      initializedRef.current = true;
    }, 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Autosave: debounce writes to active workflow ───
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (suppressAutosaveRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosave(nodes, edges);
    }, 800);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [nodes, edges, autosave]);

  // ─── WebSocket ───
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
        syncNodeIdCounter(newNodes);
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
    if (nodes.length > 0) {
      const ok = window.confirm(
        "This will replace your current workflow. Continue?"
      );
      if (!ok) return;
    }
    setGenerateLoading(true);
    setGenerateError(null);
    pipelineSocket.sendGenerateWorkflow(workflowInput.trim());
  }, [backendConnected, workflowInput, nodes.length]);

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

  // ─── Workflow management ───

  /** Full store clear — used only for delete (not switch). */
  const clearAllStores = useCallback(() => {
    useFrameStore.getState().clearAll();
    useAudioStore.getState().clearAll();
    useNodeOutputStore.getState().clearAll();
  }, []);

  const handleSwitchWorkflow = useCallback(
    (workflow: SavedWorkflow) => {
      if (workflow.id === activeWorkflowId) return;

      // Suppress autosave during the switch
      suppressAutosaveRef.current = true;

      // Signal nodes to park captures instead of destroying them
      prepareSwitch(activeWorkflowId!);

      // Clear canvas to unmount active node components
      setNodes([]);
      setEdges([]);

      setTimeout(() => {
        // Only clear node outputs, NOT frames/audio (parked captures keep writing)
        useNodeOutputStore.getState().clearAll();

        // Set active workflow BEFORE mounting new nodes (so reclaim reads correct ID)
        setActiveWorkflowId(workflow.id);
        setNodes(workflow.nodes);
        setEdges(workflow.edges);
        syncNodeIdCounter(workflow.nodes);

        completeSwitch();

        // Re-enable autosave after the new nodes settle
        setTimeout(() => {
          suppressAutosaveRef.current = false;
        }, 200);
      }, 50);
    },
    [activeWorkflowId, setNodes, setEdges, setActiveWorkflowId]
  );

  const handleNewWorkflow = useCallback(() => {
    suppressAutosaveRef.current = true;

    // Signal nodes to park captures
    if (activeWorkflowId) prepareSwitch(activeWorkflowId);

    // Clear canvas
    setNodes([]);
    setEdges([]);

    setTimeout(() => {
      useNodeOutputStore.getState().clearAll();

      // Determine name
      const existingCount = useWorkflowStore.getState().workflows.length;
      const name = `Workflow ${existingCount + 1}`;

      // Create with empty canvas
      createWorkflow(name, [], []);
      // Nodes/edges already []

      completeSwitch();

      setTimeout(() => {
        suppressAutosaveRef.current = false;
      }, 200);
    }, 50);
  }, [setNodes, setEdges, createWorkflow, activeWorkflowId]);

  const handleDeleteWorkflow = useCallback(
    (id: string) => {
      // Destroy all parked captures for this workflow
      destroyWorkflowCaptures(id);

      const nextId = deleteWorkflow(id);

      if (id === activeWorkflowId) {
        suppressAutosaveRef.current = true;
        setNodes([]);
        setEdges([]);

        setTimeout(() => {
          clearAllStores();

          if (nextId) {
            // Switch to the next workflow
            const store = useWorkflowStore.getState();
            const wf = store.workflows.find((w) => w.id === nextId);
            if (wf) {
              setActiveWorkflowId(wf.id);
              setNodes(wf.nodes);
              setEdges(wf.edges);
              syncNodeIdCounter(wf.nodes);
            }
          } else {
            // No workflows left — create a fresh default
            createWorkflow("Default Workflow", defaultNodes, defaultEdges);
            setNodes(defaultNodes);
            setEdges(defaultEdges);
            syncNodeIdCounter(defaultNodes);
          }

          setTimeout(() => {
            suppressAutosaveRef.current = false;
          }, 200);
        }, 50);
      }
    },
    [activeWorkflowId, deleteWorkflow, setNodes, setEdges, clearAllStores, createWorkflow, setActiveWorkflowId]
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
            WebkitAppRegion: "drag",
          } as React.CSSProperties}
        >
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 font-mono">
              {nodes.length} nodes &middot; {edges.length} connections
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-2xl" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
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
          </div>
        </div>

        {generateError && (
          <div className="absolute top-11 left-4 right-4 z-20 nodrag px-3 py-2 rounded-md text-xs text-red-400 border border-red-500/30 bg-red-950/30">
            {generateError}
          </div>
        )}

        {/* Workflow panel toggle tab — right edge */}
        {!workflowPanelOpen && (
          <button
            onClick={() => setWorkflowPanelOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 py-3 pl-2 pr-1 rounded-l-lg transition-colors hover:bg-[#1a1a25]"
            style={{
              background: "#13131a",
              borderTop: "1px solid #282838",
              borderLeft: "1px solid #282838",
              borderBottom: "1px solid #282838",
            }}
            title="Open Workflows"
          >
            <FolderOpen size={14} className="text-slate-500" />
            <ChevronLeft size={12} className="text-slate-600" />
          </button>
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
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[20, 20]}
          connectionRadius={25}
          noDragClassName="nodrag"
          noWheelClassName="nowheel"
          edgesUpdatable
          defaultEdgeOptions={{
            animated: true,
            style: { strokeWidth: 2, cursor: "pointer" },
            interactionWidth: 20,
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
          {/* Keyboard hint */}
          <div
            className="absolute bottom-3 left-3 z-10 flex items-center gap-3 px-3 py-1.5 rounded-md pointer-events-none"
            style={{
              background: "#0a0a0fcc",
              border: "1px solid #1e1e2e",
            }}
          >
            <span className="text-[10px] text-slate-500">
              Select + <kbd className="px-1 py-0.5 rounded bg-[#1e1e2e] text-slate-400 font-mono text-[9px]">Del</kbd> to remove nodes &amp; connections
            </span>
          </div>
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
                video: "#22d3ee",
                detection: "#f97316",
                visualLlm: "#a855f7",
                logic: "#f59e0b",
                llm: "#3b82f6",
                soundAction: "#f97316",
                logAction: "#10b981",
                notifyAction: "#eab308",
                screenshotAction: "#06b6d4",
                webhookAction: "#8b5cf6",
                emailAction: "#3b82f6",
                smsAction: "#14b8a6",
                mic: "#06b6d4",
                audioDetect: "#8b5cf6",
                audioLlm: "#ec4899",
              };
              return colors[node.type || ""] || "#64748b";
            }}
          />
        </ReactFlow>
      </div>

      {/* Workflow Manager Panel */}
      <WorkflowPanel
        isOpen={workflowPanelOpen}
        onToggle={() => setWorkflowPanelOpen(false)}
        onSwitchWorkflow={handleSwitchWorkflow}
        onNewWorkflow={handleNewWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
        onRenameWorkflow={renameWorkflow}
        activeWorkflowId={activeWorkflowId}
        workflows={workflows}
        canvasNodes={nodes}
      />
    </div>
  );
}
