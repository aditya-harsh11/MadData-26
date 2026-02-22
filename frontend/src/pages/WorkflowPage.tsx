import { useState, useCallback, useRef } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { WorkflowCanvas } from '../components/workflow/WorkflowCanvas';
import { NodePalette } from '../components/workflow/NodePalette';
import { NLWorkflow } from '../components/workflow/NLWorkflow';
import { useWorkflowStore } from '../stores/workflowStore';
import { useWorkflowEngine } from '../hooks/useWorkflowEngine';
import { generateWorkflowFromVoice } from '../lib/api';

export function WorkflowPage() {
  const [showNLDialog, setShowNLDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const clearCanvas = useWorkflowStore((s) => s.clearCanvas);
  const workflows = useWorkflowStore((s) => s.workflows);
  const activeWorkflow = useWorkflowStore((s) => s.activeWorkflow);
  const setNodesAndEdges = useWorkflowStore((s) => s.setNodesAndEdges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const { isRunning, start, stop, activeNodes, triggeredActions } = useWorkflowEngine();

  const handleSave = useCallback(() => {
    if (saveName.trim()) {
      saveWorkflow(saveName.trim());
      setSaveName('');
      setShowSaveDialog(false);
    }
  }, [saveName, saveWorkflow]);

  const handleLoad = useCallback(
    (id: string) => {
      loadWorkflow(id);
      setShowLoadDialog(false);
    },
    [loadWorkflow]
  );

  const handleVoiceCommand = useCallback(async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());

        try {
          const workflow = await generateWorkflowFromVoice(audioBlob);
          if (workflow?.nodes && workflow?.edges) {
            const typeMap: Record<string, string> = {
              camera: 'cameraNode', trigger: 'triggerNode',
              condition: 'conditionNode', action: 'actionNode',
            };
            const nodes = (workflow.nodes as any[]).map((n: any) => ({
              id: n.id,
              type: typeMap[n.type] || `${n.type}Node`,
              position: n.position || { x: 0, y: 0 },
              data: { label: n.type, type: n.type, config: n.data || {} },
            }));
            const edges = (workflow.edges as any[]).map((e: any, i: number) => ({
              id: e.id || `edge-${i}-${Date.now()}`,
              source: e.source,
              target: e.target,
            }));
            setNodesAndEdges(nodes, edges);
          }
        } catch (err) {
          console.error('Voice workflow generation failed:', err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      console.error('Microphone access denied');
    }
  }, [isRecording, setNodesAndEdges]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/50 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={nodes.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>

          <button
            onClick={() => setShowLoadDialog(true)}
            disabled={workflows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Load
          </button>

          <button
            onClick={clearCanvas}
            disabled={nodes.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Clear
          </button>
        </div>

        <div className="w-px h-6 bg-slate-700 mx-1" />

        <button
          onClick={isRunning ? stop : start}
          disabled={nodes.length === 0}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${
            isRunning
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-green-600 hover:bg-green-500 text-white'
          }`}
        >
          {isRunning ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Run
            </>
          )}
        </button>

        {isRunning && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">
              Active: {activeNodes.length} nodes
            </span>
            {triggeredActions.length > 0 && (
              <span className="text-xs text-amber-400">
                {triggeredActions.length} actions fired
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setShowNLDialog(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
          Generate from Text
        </button>

        <button
          onClick={handleVoiceCommand}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
            isRecording
              ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
          }`}
          title={isRecording ? 'Stop recording' : 'Voice command'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {activeWorkflow && (
          <span className="text-[10px] text-slate-500 ml-2">
            Workflow: {workflows.find((w) => w.id === activeWorkflow)?.name || 'Untitled'}
          </span>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 flex min-h-0">
        <ReactFlowProvider>
          <NodePalette />
          <div className="flex-1">
            <WorkflowCanvas />
          </div>
        </ReactFlowProvider>
      </div>

      {/* NL Workflow Dialog */}
      <NLWorkflow isOpen={showNLDialog} onClose={() => setShowNLDialog(false)} />

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Save Workflow</h3>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Workflow name..."
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 mb-3 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Load Workflow</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {workflows.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleLoad(w.id)}
                  className="w-full text-left px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                >
                  <div className="text-sm text-slate-200">{w.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {w.nodes.length} nodes, {w.edges.length} edges - {new Date(w.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
