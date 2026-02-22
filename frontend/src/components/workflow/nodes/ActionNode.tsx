import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useWorkflowStore } from '../../../stores/workflowStore';

const ACTION_TYPES = [
  { value: 'alert', label: 'Send Alert' },
  { value: 'sound', label: 'Play Sound' },
  { value: 'log', label: 'Log Event' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'tts_announce', label: 'TTS Announce' },
];

function ActionNodeInner({ id, data }: NodeProps) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const config = data?.config || {};
  const actionType = config.actionType || 'alert';
  const message = config.message || '';
  const webhookUrl = config.webhookUrl || '';

  const updateConfig = useCallback(
    (key: string, value: string) => {
      updateNodeData(id, {
        config: { ...config, [key]: value },
      });
    },
    [id, config, updateNodeData]
  );

  return (
    <div className="min-w-[180px] rounded-xl overflow-hidden shadow-lg border border-green-500/30 bg-slate-900">
      <div className="flex items-center gap-2 px-3 py-2 bg-green-600">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span className="text-xs font-semibold text-white">Action</span>
      </div>

      <div className="px-3 py-2.5 space-y-2 nodrag nopan nowheel">
        <select
          value={actionType}
          onChange={(e) => updateConfig('actionType', e.target.value)}
          className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {ACTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {actionType === 'webhook' ? (
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => updateConfig('webhookUrl', e.target.value)}
            placeholder="https://webhook.example.com"
            className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        ) : (
          <input
            type="text"
            value={message}
            onChange={(e) => updateConfig('message', e.target.value)}
            placeholder={
              actionType === 'tts_announce'
                ? 'Alert: person detected'
                : actionType === 'sound'
                  ? 'alert.mp3'
                  : 'Alert message...'
            }
            className="w-full text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-green-400 !border-2 !border-slate-900" />
    </div>
  );
}

export const ActionNode = memo(ActionNodeInner);
