import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { SiteFooter } from './SiteFooter';

function userInitials(name?: string, email?: string) {
  const trimmed = (name || '').trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'U';
  }
  const mail = (email || '').trim();
  if (mail) return mail[0].toUpperCase();
  return 'U';
}

function Avatar({
  user,
  className,
  size = 'sm',
}: {
  user: { name?: string; email?: string } | null;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const initials = userInitials(user?.name, user?.email);
  return (
    <span
      className={`user-avatar-fallback ${size === 'lg' ? 'lg' : ''} ${className || ''}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

const USER_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/portfolio', label: 'My Portfolio' },
  { to: '/recurring', label: 'Recurring' },
  { to: '/market', label: 'Market' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const links = [
    ...USER_LINKS,
    ...(user?.role === 'admin'
      ? [{ to: '/admin', label: 'Admin', end: false }]
      : []),
  ];

  useEffect(() => {
    setMenuOpen(false);
    setSheetOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    return () => document.body.classList.remove('menu-open');
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && !sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSheetOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, sheetOpen]);

  function openAccount() {
    setMenuOpen(false);
    setSheetOpen(true);
  }

  function closeAll() {
    setMenuOpen(false);
    setSheetOpen(false);
  }

  async function onLogout() {
    closeAll();
    await logout();
  }

  return (
    <div className={`app-shell${menuOpen ? ' is-menu-open' : ''}`}>
      <aside className="web-sidebar" aria-label="Primary">
        <Link to="/" className="web-brand">
          <span className="web-brand-mark">FG</span>
          <span>
            <strong>{title || 'Fin Goat'}</strong>
            <small>Wealth + markets</small>
          </span>
        </Link>
        <nav className="web-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `web-nav-link${isActive ? ' active' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="web-sidebar-foot">
          <p className="web-user-chip">
            <Avatar user={user} />
            <span>
              <strong>{user?.name}</strong>
              <small>{user?.planId} plan</small>
            </span>
          </p>
        </div>
      </aside>

      <div className="web-stage">
        <header className="app-header desktop-bar">
          <div className="desktop-bar-copy">
            {location.pathname.startsWith('/admin') ? (
              <>
                <p className="eyebrow">Admin</p>
                <p className="desktop-bar-path">Console</p>
              </>
            ) : location.pathname.startsWith('/market') ? (
              <>
                <p className="eyebrow">Market</p>
                <p className="desktop-bar-path">
                  {location.pathname === '/market' ||
                  location.pathname === '/market/'
                    ? 'Stocks & screeners'
                    : location.pathname.split('/').pop()?.toUpperCase() ||
                      'Stock detail'}
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">Fin Goat</p>
                <p className="desktop-bar-path">
                  {links.find((l) =>
                    l.end
                      ? location.pathname === l.to
                      : location.pathname.startsWith(l.to),
                  )?.label || 'App'}
                </p>
              </>
            )}
          </div>
          <div className="app-header-actions">
            <button
              type="button"
              className="icon-btn theme-toggle"
              onClick={toggleTheme}
              aria-label={
                theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
              }
            >
              {theme === 'light' ? '☾' : '☀'}
            </button>
            <button
              type="button"
              className="icon-btn signout-btn"
              onClick={() => void onLogout()}
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </header>

        <header className="mobile-bar">
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="menu-toggle-bars" aria-hidden="true" />
          </button>
          <Link to="/" className="mobile-wordmark" onClick={() => setMenuOpen(false)}>
            FIN GOAT
          </Link>
          <div className="mobile-bar-actions">
            <button
              type="button"
              className="mobile-account-btn"
              aria-label="Account"
              aria-expanded={sheetOpen}
              aria-controls="user-sheet"
              onClick={openAccount}
            >
              <Avatar user={user} />
            </button>
          </div>
        </header>

        <div
          className="mobile-menu"
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          hidden={!menuOpen}
        >
          <nav className="mobile-menu-nav">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `mobile-nav-link${isActive ? ' active' : ''}`
                }
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mobile-menu-footer">
            <button type="button" className="mobile-cta ghost-cta" onClick={toggleTheme}>
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
            <button type="button" className="mobile-cta" onClick={openAccount}>
              Account
            </button>
            <button
              type="button"
              className="mobile-cta ghost-cta"
              onClick={() => void onLogout()}
            >
              Log out
            </button>
          </div>
        </div>

        {sheetOpen && (
          <div
            className="user-sheet"
            id="user-sheet"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSheetOpen(false);
            }}
          >
            <div
              className="user-sheet-card"
              role="dialog"
              aria-labelledby="user-sheet-name"
            >
              <button
                type="button"
                className="icon-btn sheet-close"
                aria-label="Close account"
                onClick={() => setSheetOpen(false)}
              >
                ×
              </button>
              <div className="user-sheet-hero">
                <Avatar user={user} size="lg" />
                <div>
                  <h2 id="user-sheet-name">{user?.name || 'Account'}</h2>
                  <p className="note">{user?.email || ''}</p>
                </div>
              </div>
              <dl className="user-sheet-meta">
                <div>
                  <dt>Plan</dt>
                  <dd>{user?.planId || '—'}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{user?.role || '—'}</dd>
                </div>
                <div>
                  <dt>Theme</dt>
                  <dd>{theme}</dd>
                </div>
              </dl>
              <button type="button" className="sheet-theme" onClick={toggleTheme}>
                Switch to {theme === 'light' ? 'dark' : 'light'} mode
              </button>
              <button
                type="button"
                className="sheet-logout"
                onClick={() => void onLogout()}
              >
                Log out
              </button>
            </div>
          </div>
        )}

        <main className="app-main">{children}</main>
        <SiteFooter onNavigate={closeAll} />
      </div>
    </div>
  );
}
