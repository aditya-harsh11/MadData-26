import { useState, useCallback, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { useDetectionStore } from '../stores/detectionStore';
import { useAlertStore } from '../stores/alertStore';
import type { Detection } from '../types';
import type { Node, Edge } from 'reactflow';

interface TriggeredAction {
  nodeId: string;
  actionType: string;
  message: string;
  timestamp: string;
}

export function useWorkflowEngine() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [triggeredActions, setTriggeredActions] = useState<TriggeredAction[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunningRef = useRef(false);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const detections = useDetectionStore((s) => s.detections);
  const addAlert = useAlertStore((s) => s.addAlert);

  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  const detectionsRef = useRef<Detection[]>(detections);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    detectionsRef.current = detections;
  }, [detections]);

  const getDownstreamNodes = useCallback((nodeId: string, edgeList: Edge[], sourceHandle?: string): string[] => {
    return edgeList
      .filter((e) => e.source === nodeId && (!sourceHandle || e.sourceHandle === sourceHandle))
      .map((e) => e.target);
  }, []);

  const evaluateTrigger = useCallback((node: Node, currentDetections: Detection[]): boolean => {
    const config = node.data?.config || {};
    const triggerType = config.triggerType || 'object_detected';

    switch (triggerType) {
      case 'object_detected':
        return currentDetections.length > 0;
      case 'face_recognized':
        return currentDetections.some((d) => d.class_name === 'person');
      case 'motion_detected':
        return currentDetections.length > 0;
      case 'scene_change':
        return currentDetections.length > 2;
      default:
        return false;
    }
  }, []);

  const evaluateCondition = useCallback((node: Node, currentDetections: Detection[]): boolean => {
    const config = node.data?.config || {};
    const conditionType = config.conditionType || 'object_class';
    const operator = config.operator || 'equals';
    const value = config.value || '';

    switch (conditionType) {
      case 'object_class': {
        const className = value.toLowerCase();
        const hasMatch = currentDetections.some((d) => {
          const name = d.class_name.toLowerCase();
          switch (operator) {
            case 'equals': return name === className;
            case 'contains': return name.includes(className);
            default: return name === className;
          }
        });
        return hasMatch;
      }
      case 'confidence_threshold': {
        const threshold = parseFloat(value) || 0.5;
        const hasMatch = currentDetections.some((d) => {
          switch (operator) {
            case 'greater_than': return d.confidence > threshold;
            case 'less_than': return d.confidence < threshold;
            case 'equals': return Math.abs(d.confidence - threshold) < 0.01;
            default: return d.confidence > threshold;
          }
        });
        return hasMatch;
      }
      case 'time_range': {
        const now = new Date();
        const hours = now.getHours();
        const parts = value.split('-');
        if (parts.length === 2) {
          const start = parseInt(parts[0], 10);
          const end = parseInt(parts[1], 10);
          return hours >= start && hours <= end;
        }
        return true;
      }
      case 'zone':
        return currentDetections.length > 0;
      default:
        return false;
    }
  }, []);

  const executeAction = useCallback((node: Node, currentDetections: Detection[]) => {
    const config = node.data?.config || {};
    const actionType = config.actionType || 'alert';
    const actionMessage = config.message || `Action triggered: ${actionType}`;

    const action: TriggeredAction = {
      nodeId: node.id,
      actionType,
      message: actionMessage,
      timestamp: new Date().toISOString(),
    };

    setTriggeredActions((prev) => [action, ...prev].slice(0, 50));

    switch (actionType) {
      case 'alert':
        addAlert('workflow', 'warning', actionMessage, {
          detectionCount: currentDetections.length,
        });
        break;
      case 'sound':
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          if (audioCtx.state === 'suspended') {
            audioCtx.resume();
          }
          // Play 3 short beeps
          const playBeep = (time: number, freq: number) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.linearRampToValueAtTime(0, time + 0.15);
            osc.start(time);
            osc.stop(time + 0.15);
          };
          const now = audioCtx.currentTime;
          playBeep(now, 800);
          playBeep(now + 0.2, 1000);
          playBeep(now + 0.4, 1200);
        } catch {
          // Audio not available
        }
        break;
      case 'tts_announce':
        try {
          const utterance = new SpeechSynthesisUtterance(actionMessage);
          utterance.rate = 1.1;
          speechSynthesis.speak(utterance);
        } catch {
          // TTS not available
        }
        break;
      case 'log':
        console.log(`[CamerAI Workflow] ${actionMessage}`, {
          detections: currentDetections,
          timestamp: new Date().toISOString(),
        });
        addAlert('workflow', 'info', `Log: ${actionMessage}`);
        break;
      case 'webhook':
        if (config.webhookUrl) {
          fetch(config.webhookUrl as string, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: actionMessage,
              detections: currentDetections,
              timestamp: new Date().toISOString(),
            }),
          }).catch(() => {
            // Webhook error silently ignored
          });
        }
        break;
      default:
        break;
    }
  }, [addAlert]);

  const evaluateWorkflow = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const currentDetections = detectionsRef.current;

    if (currentNodes.length === 0) return;

    const active: string[] = [];

    const cameraNodes = currentNodes.filter((n) => n.type === 'cameraNode');

    for (const camNode of cameraNodes) {
      active.push(camNode.id);

      const triggerIds = getDownstreamNodes(camNode.id, currentEdges);

      for (const triggerId of triggerIds) {
        const triggerNode = currentNodes.find((n) => n.id === triggerId);
        if (!triggerNode || triggerNode.type !== 'triggerNode') continue;

        const triggered = evaluateTrigger(triggerNode, currentDetections);
        if (!triggered) continue;

        active.push(triggerId);

        const conditionIds = getDownstreamNodes(triggerId, currentEdges);

        for (const condId of conditionIds) {
          const condNode = currentNodes.find((n) => n.id === condId);
          if (!condNode) continue;

          if (condNode.type === 'conditionNode') {
            const condResult = evaluateCondition(condNode, currentDetections);
            active.push(condId);

            const outputHandle = condResult ? 'true' : 'false';
            const actionIds = getDownstreamNodes(condId, currentEdges, outputHandle);

            // Also check edges without specific handles
            const allActionIds = getDownstreamNodes(condId, currentEdges);
            const allTargets = [...new Set([...actionIds, ...allActionIds])];

            if (condResult) {
              for (const actId of allTargets) {
                const actNode = currentNodes.find((n) => n.id === actId);
                if (!actNode || actNode.type !== 'actionNode') continue;
                active.push(actId);
                executeAction(actNode, currentDetections);
              }
            }
          } else if (condNode.type === 'actionNode') {
            active.push(condId);
            executeAction(condNode, currentDetections);
          }
        }
      }
    }

    setActiveNodes(active);
  }, [getDownstreamNodes, evaluateTrigger, evaluateCondition, executeAction]);

  const start = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);
    setTriggeredActions([]);

    intervalRef.current = setInterval(() => {
      evaluateWorkflow();
    }, 500);
  }, [evaluateWorkflow]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setActiveNodes([]);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isRunning,
    start,
    stop,
    activeNodes,
    triggeredActions,
  };
}
