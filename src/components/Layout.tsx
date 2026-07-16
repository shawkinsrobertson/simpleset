import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { to: '/today', label: 'Today', icon: '🏋️' },
  { to: '/plan', label: 'Plan', icon: '📋' },
  { to: '/stats', label: 'Stats', icon: '📈' },
  { to: '/plans', label: 'Plans', icon: '⚙️' },
];

export default function Layout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const maxWidth = wide ? 'max-w-4xl' : 'max-w-md';
  return (
    <div className={`mx-auto flex min-h-screen ${maxWidth} flex-col bg-slate-50 transition-[max-width]`}>
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <nav className={`fixed inset-x-0 bottom-0 mx-auto flex ${maxWidth} border-t border-slate-200 bg-white/95 backdrop-blur`}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium',
                isActive ? 'text-brand-600' : 'text-slate-400',
              )
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
