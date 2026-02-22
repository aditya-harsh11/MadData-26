import { useState, useRef, useCallback } from 'react';
import { generateWorkflow, generateWorkflowFromVoice } from '../../lib/api';
import { useWorkflowStore } from '../../stores/workflowStore';
import type { Workflow } from '../../types';

interface NLWorkflowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NLWorkflow({ isOpen, onClose }: NLWorkflowProps) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [preview, setPreview] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const setNodesAndEdges = useWorkflowStore((s) => s.setNodesAndEdges);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setError(null);
    setPreview(null);

    try {
      const workflow = await generateWorkflow(text.trim());
      setPreview(workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workflow');
    } finally {
      setIsLoading(false);
    }
  }, [text]);

  const handleApply = useCallback(() => {
    if (!preview) return;

    // Map backend node types to ReactFlow node type IDs
    const typeMap: Record<string, string> = {
      camera: 'cameraNode',
      trigger: 'triggerNode',
      condition: 'conditionNode',
      action: 'actionNode',
    };

    const nodes = preview.nodes.map((n: any) => ({
      id: n.id,
      type: typeMap[n.type] || `${n.type}Node`,
      position: n.position || { x: 0, y: 0 },
      data: {
        label: n.type.charAt(0).toUpperCase() + n.type.slice(1),
        type: n.type,
        config: n.data || {},
      },
    }));
    const edges = preview.edges.map((e: any, i: number) => ({
      id: e.id || `edge-${i}-${Date.now()}`,
      source: e.source,
      target: e.target,
    }));
    setNodesAndEdges(nodes, edges);
    onClose();
  }, [preview, setNodesAndEdges, onClose]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());

        setIsLoading(true);
        setError(null);
        try {
          const workflow = await generateWorkflowFromVoice(audioBlob);
          setPreview(workflow);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process voice command');
        } finally {
          setIsLoading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError('Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <h2 className="text-base font-semibold text-white">Generate Workflow</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Describe your workflow in natural language
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="When a person is detected with high confidence during work hours, send an alert and log the event..."
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 resize-none placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={isLoading || !text.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                  Generate
                </>
              )}
            </button>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2.5 rounded-xl transition-colors ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
              }`}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Preview
              </h3>
              <div className="max-h-48 overflow-auto bg-slate-800 rounded-xl p-3 border border-slate-700">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      name: preview.name,
                      nodes: preview.nodes.length,
                      edges: preview.edges.length,
                      details: preview.nodes.map((n) => ({
                        type: n.type,
                        label: n.data?.label,
                      })),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
              <button
                onClick={handleApply}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Apply to Canvas
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
