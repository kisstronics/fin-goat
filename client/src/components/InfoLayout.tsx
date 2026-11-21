import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { AppShell } from './AppShell';
import { SiteFooter } from './SiteFooter';

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
        <Link to="/" className="ghost-link">
          Back to home
        </Link>
        <p className="public-info-title">{title}</p>
      </header>
      <main className="app-main">{children}</main>
      <SiteFooter />
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
