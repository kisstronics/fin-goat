import { Link } from 'react-router-dom';

export function SiteFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <footer className="site-footer app-footer">
      <nav className="footer-links" aria-label="Site">
        <Link className="footer-link" to="/about" onClick={onNavigate}>
          Who we are
        </Link>
        <Link className="footer-link" to="/privacy" onClick={onNavigate}>
          Privacy policy
        </Link>
        <Link className="footer-link" to="/contact" onClick={onNavigate}>
          Contact us
        </Link>
      </nav>
      <p className="footer-copy">Knics@2026</p>
    </footer>
  );
}
