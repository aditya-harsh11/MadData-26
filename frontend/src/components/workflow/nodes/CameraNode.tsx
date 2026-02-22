import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

function CameraNodeInner({ data }: NodeProps) {
  const label = data?.label || 'Camera 1';

  return (
    <div className="min-w-[160px] rounded-xl overflow-hidden shadow-lg border border-slate-600/30 bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        <span className="text-xs font-semibold text-white">Camera</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-slate-300">{label}</span>
        </div>
      </div>

      {/* Source Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-slate-900"
      />
    </div>
  );
}

export const CameraNode = memo(CameraNodeInner);
