import { Link } from 'react-router-dom';
import { SiteFooter } from '../components/SiteFooter';
import { useTheme } from '../theme';

const features = [
  {
    id: 'dashboard',
    title: 'Net worth at a glance',
    body: 'See assets, liabilities, allocation, and returns in one household dashboard.',
  },
  {
    id: 'portfolio',
    title: 'Unified portfolio',
    body: 'Track stocks, mutual funds, EPFO, FDs, gold, real estate, cash lending, and loans together.',
  },
  {
    id: 'screeners',
    title: 'Stock screeners',
    body: 'Golden Cross, Near 52 Week Low, and recovery-from-low screens on Indian market data.',
  },
  {
    id: 'alerts',
    title: 'Alerts & settings',
    body: 'Plans, email and Telegram notifications, and phone preferences under your account.',
  },
];

export function HomePage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="mobile-shell home-shell">
      <button
        type="button"
        className="icon-btn theme-toggle login-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>

      <main className="home-page">
        <section className="home-hero">
          <p className="brand">Fin Goat</p>
          <h1>All investments in one glance</h1>
          <p className="lede">
            Indian personal wealth and market intelligence — portfolio tracking,
            screeners, and alerts built around your household net worth.
          </p>
          <div className="home-actions">
            <Link className="btn primary" to="/login">
              Sign in
            </Link>
            <a className="btn secondary" href="#features">
              See features
            </a>
          </div>
        </section>

        <section className="home-features" id="features">
          <p className="eyebrow">Key features</p>
          <h2>What Fin Goat covers</h2>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature.id} className="feature-item">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
          <p className="muted home-disclaimer">
            Screeners are analytical tools based on historical market data — not
            buy or sell recommendations.
          </p>
        </section>

        <section className="home-close">
          <p className="eyebrow">Start tracking</p>
          <h2>Sign in to open your dashboard</h2>
          <p className="lede">
            Bring investments and loans into one view, then run screeners when you
            need a market check.
          </p>
          <Link className="btn primary" to="/login">
            Continue to sign in
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
