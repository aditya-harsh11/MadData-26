import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useWorkflowStore } from '../../../stores/workflowStore';

const TRIGGER_TYPES = [
  { value: 'object_detected', label: 'Object Detected' },
  { value: 'face_recognized', label: 'Face Recognized' },
  { value: 'motion_detected', label: 'Motion Detected' },
  { value: 'scene_change', label: 'Scene Change' },
];

function TriggerNodeInner({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const config = data?.config || {};
  const triggerType = config.triggerType || 'object_detected';
  const objectFilter = config.objectFilter || '';

  const updateConfig = useCallback(
    (key: string, value: string) => {
      updateNodeData(id, {
        config: { ...config, [key]: value },
      });
    },
    [id, config, updateNodeData]
  );

  return (
    <div className="min-w-[180px] rounded-xl overflow-hidden shadow-lg border border-orange-500/30 bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-600">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="text-xs font-semibold text-white">Trigger</span>
      </div>

      <div className="px-3 py-2.5 space-y-2 nodrag nopan nowheel">
        <select
          value={triggerType}
          onChange={(e) => updateConfig('triggerType', e.target.value)}
          className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {triggerType === 'object_detected' && (
          <input
            type="text"
            value={objectFilter}
            onChange={(e) => updateConfig('objectFilter', e.target.value)}
            placeholder="Filter class (e.g. person)"
            className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-orange-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-orange-400 !border-2 !border-slate-900" />
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeInner);
