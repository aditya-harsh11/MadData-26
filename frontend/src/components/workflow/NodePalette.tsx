import { type DragEvent } from 'react';

interface PaletteItem {
  type: string;
  label: string;
  color: string;
  icon: JSX.Element;
}

const paletteItems: PaletteItem[] = [
  {
    type: 'cameraNode',
    label: 'Camera',
    color: 'bg-slate-600',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    type: 'triggerNode',
    label: 'Trigger',
    color: 'bg-orange-600',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    type: 'conditionNode',
    label: 'Condition',
    color: 'bg-blue-600',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 6.5v5L12 21l-9-6.5v-5L12 3z" />
        <path d="M12 12l9-6.5" />
        <path d="M12 12v9" />
        <path d="M12 12L3 5.5" />
      </svg>
    ),
  },
  {
    type: 'actionNode',
    label: 'Action',
    color: 'bg-green-600',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
];

export function NodePalette() {
  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
        Node Palette
      </h3>
      <p className="text-[11px] text-slate-500 mb-2">
        Drag nodes onto the canvas to build workflows.
      </p>

      {paletteItems.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-grab active:cursor-grabbing hover:border-slate-600 hover:bg-slate-800 transition-all select-none group"
        >
          <div className={`p-2 rounded-lg ${item.color} text-white`}>
            {item.icon}
          </div>
          <div>
            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
              {item.label}
            </span>
          </div>
        </div>
      ))}

      <div className="mt-auto pt-4 border-t border-slate-800">
        <div className="text-[10px] text-slate-500 space-y-1">
          <p className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
            Camera: Source node
          </p>
          <p className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            Trigger: Event detector
          </p>
          <p className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            Condition: Logic filter
          </p>
          <p className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Action: Output handler
          </p>
        </div>
      </div>
    </div>
  );
}
