import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';

export interface SavedWorkflow {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
}

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  workflows: SavedWorkflow[];
  activeWorkflow: string | null;
  addNode: (node: Node) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, data: Partial<Node>) => void;
  updateNodeData: (id: string, dataUpdate: Record<string, unknown>) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  setNodesAndEdges: (nodes: Node[], edges: Edge[]) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (changes: any[]) => void;
  saveWorkflow: (name: string) => void;
  loadWorkflow: (id: string) => void;
  setActiveWorkflow: (id: string | null) => void;
  clearCanvas: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  workflows: [],
  activeWorkflow: null,

  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node] })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    })),

  updateNode: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, ...data } : n
      ),
    })),

  updateNodeData: (id, dataUpdate) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, ...dataUpdate } }
          : n
      ),
    })),

  addEdge: (edge) =>
    set((state) => {
      const exists = state.edges.find(
        (e) => e.source === edge.source && e.target === edge.target
      );
      if (exists) return state;
      return { edges: [...state.edges, edge] };
    }),

  removeEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    })),

  setNodesAndEdges: (nodes, edges) => set({ nodes, edges }),

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    set((state) => {
      let newNodes = [...state.nodes];
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          newNodes = newNodes.map((n) =>
            n.id === change.id ? { ...n, position: change.position } : n
          );
        } else if (change.type === 'remove') {
          newNodes = newNodes.filter((n) => n.id !== change.id);
        } else if (change.type === 'select') {
          newNodes = newNodes.map((n) =>
            n.id === change.id ? { ...n, selected: change.selected } : n
          );
        } else if (change.type === 'dimensions' && change.dimensions) {
          newNodes = newNodes.map((n) =>
            n.id === change.id
              ? { ...n, width: change.dimensions.width, height: change.dimensions.height }
              : n
          );
        }
      }
      return { nodes: newNodes };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      let newEdges = [...state.edges];
      for (const change of changes) {
        if (change.type === 'remove') {
          newEdges = newEdges.filter((e) => e.id !== change.id);
        } else if (change.type === 'select') {
          newEdges = newEdges.map((e) =>
            e.id === change.id ? { ...e, selected: change.selected } : e
          );
        }
      }
      return { edges: newEdges };
    });
  },

  saveWorkflow: (name) => {
    const { nodes, edges, workflows } = get();
    const workflow: SavedWorkflow = {
      id: generateId(),
      name,
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      createdAt: new Date().toISOString(),
    };
    set({ workflows: [...workflows, workflow], activeWorkflow: workflow.id });
  },

  loadWorkflow: (id) => {
    const { workflows } = get();
    const workflow = workflows.find((w) => w.id === id);
    if (workflow) {
      set({
        nodes: JSON.parse(JSON.stringify(workflow.nodes)),
        edges: JSON.parse(JSON.stringify(workflow.edges)),
        activeWorkflow: id,
      });
    }
  },

  setActiveWorkflow: (id) => set({ activeWorkflow: id }),

  clearCanvas: () => set({ nodes: [], edges: [], activeWorkflow: null }),
}));
