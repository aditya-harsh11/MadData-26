import { useState } from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
}

const navItems: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="6" r="3" />
        <circle cx="19" cy="6" r="3" />
        <circle cx="12" cy="18" r="3" />
        <line x1="5" y1="9" x2="5" y2="12" />
        <line x1="19" y1="9" x2="19" y2="12" />
        <path d="M5 12 C5 15 12 15 12 15" />
        <path d="M19 12 C19 15 12 15 12 15" />
      </svg>
    ),
  },
  {
    to: '/faces',
    label: 'Faces',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <circle cx="15" cy="10" r="1.5" fill="currentColor" />
        <path d="M8 15 C9 17 15 17 16 15" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <nav
      className="fixed left-0 top-0 h-full z-40 flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out"
      style={{ width: isExpanded ? '200px' : '64px' }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="28" height="28" viewBox="0 0 100 100" className="shrink-0">
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#e2e8f0' }} />
                <stop offset="100%" style={{ stopColor: '#94a3b8' }} />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#logo-grad)" />
            <circle cx="50" cy="50" r="18" fill="none" stroke="white" strokeWidth="3" />
            <circle cx="50" cy="50" r="7" fill="white" />
          </svg>
          {isExpanded && (
            <span className="text-sm font-bold text-white whitespace-nowrap overflow-hidden">
              CamerAI
            </span>
          )}
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex flex-col gap-1 p-2 mt-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`
            }
          >
            <span className="shrink-0">{item.icon}</span>
            {isExpanded && (
              <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                {item.label}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Bottom section */}
      <div className="mt-auto p-2 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 text-slate-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          {isExpanded && (
            <span className="text-xs whitespace-nowrap">v1.0.0</span>
          )}
        </div>
      </div>
    </nav>
  );
}
