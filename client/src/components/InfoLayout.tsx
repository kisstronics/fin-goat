import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { AppShell } from './AppShell';

function PublicInfoShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="mobile-shell public-info-shell">
      <header className="public-info-header">
        <Link to="/login" className="ghost-link">
          Back to sign in
        </Link>
        <p className="public-info-title">{title}</p>
      </header>
      <main className="app-main">{children}</main>
      <footer className="site-footer app-footer">
        <nav className="footer-links" aria-label="Site">
          <Link className="footer-link" to="/about">
            Who we are
          </Link>
          <Link className="footer-link" to="/privacy">
            Privacy policy
          </Link>
          <Link className="footer-link" to="/contact">
            Contact us
          </Link>
        </nav>
        <p className="footer-copy">Knics@2026</p>
      </footer>
    </div>
  );
}

export function InfoLayout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-main center">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <AppShell title={title}>{children}</AppShell>;
  }

  return <PublicInfoShell title={title}>{children}</PublicInfoShell>;
}
