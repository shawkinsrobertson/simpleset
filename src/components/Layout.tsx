import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/today', slug: 'today' },
  { to: '/plan', slug: 'plan' },
  { to: '/stats', slug: 'stats' },
  { to: '/plans', slug: 'library' },
  { to: '/settings', slug: 'settings' },
];

export default function Layout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const maxWidth = wide ? 'max-w-4xl' : 'max-w-md';
  return (
    <div className={`mx-auto flex min-h-screen ${maxWidth} flex-col bg-bg transition-[max-width]`}>
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <nav className={`fixed inset-x-0 bottom-0 mx-auto flex ${maxWidth} border-t border-border bg-card/95 backdrop-blur`}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="flex flex-1 items-center justify-center py-1"
          >
            {({ isActive }) => {
              const state = isActive ? 'active' : 'inactive';
              return (
                <>
                  {/* Light mode icon */}
                  <img
                    src={`/icons/nav-${tab.slug}-${state}-light.png`}
                    alt={tab.slug}
                    className="h-14 w-auto dark:hidden"
                    draggable={false}
                  />
                  {/* Dark mode icon */}
                  <img
                    src={`/icons/nav-${tab.slug}-${state}-dark.png`}
                    alt={tab.slug}
                    className="hidden h-14 w-auto dark:block"
                    draggable={false}
                  />
                </>
              );
            }}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
