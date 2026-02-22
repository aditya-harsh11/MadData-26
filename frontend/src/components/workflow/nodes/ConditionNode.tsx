import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useWorkflowStore } from '../../../stores/workflowStore';

const CONDITION_TYPES = [
  { value: 'object_class', label: 'Object Class' },
  { value: 'confidence_threshold', label: 'Confidence Threshold' },
  { value: 'time_range', label: 'Time Range' },
  { value: 'zone', label: 'Zone' },
];

const OPERATORS = [
  { value: 'equals', label: '=' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'contains', label: 'contains' },
];

function ConditionNodeInner({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const config = data?.config || {};
  const conditionType = config.conditionType || 'object_class';
  const operator = config.operator || 'equals';
  const value = config.value || '';

  const updateConfig = useCallback(
    (key: string, val: string) => {
      updateNodeData(id, {
        config: { ...config, [key]: val },
      });
    },
    [id, config, updateNodeData]
  );

  return (
    <div className="min-w-[200px] rounded-xl overflow-hidden shadow-lg border border-blue-500/30 bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-600">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l9 6.5v5L12 21l-9-6.5v-5L12 3z" />
          <path d="M12 12l9-6.5" />
          <path d="M12 12v9" />
          <path d="M12 12L3 5.5" />
        </svg>
        <span className="text-xs font-semibold text-white">Condition</span>
      </div>

      <div className="px-3 py-2.5 space-y-2 nodrag nopan nowheel">
        <select
          value={conditionType}
          onChange={(e) => updateConfig('conditionType', e.target.value)}
          className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {CONDITION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={operator}
          onChange={(e) => updateConfig('operator', e.target.value)}
          className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={value}
          onChange={(e) => updateConfig('value', e.target.value)}
          placeholder={
            conditionType === 'confidence_threshold'
              ? '0.5'
              : conditionType === 'time_range'
                ? '9-17'
                : 'person'
          }
          className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-blue-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Right} id="true" style={{ top: '40%' }} className="!w-3 !h-3 !bg-green-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} className="!w-3 !h-3 !bg-red-400 !border-2 !border-slate-900" />

      <div className="absolute right-5 text-[9px] font-medium text-green-400" style={{ top: 'calc(40% - 5px)' }}>T</div>
      <div className="absolute right-5 text-[9px] font-medium text-red-400" style={{ top: 'calc(70% - 5px)' }}>F</div>
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeInner);
