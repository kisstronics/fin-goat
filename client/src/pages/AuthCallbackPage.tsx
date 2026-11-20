import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const { completeTokenLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Missing token from Google login');
      return;
    }

    let cancelled = false;
    completeTokenLogin(token)
      .then(() => {
        if (!cancelled) navigate('/', { replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Google login failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params, completeTokenLogin, navigate]);

  return (
    <div className="mobile-shell">
      <div className="app-main center">
        {error ? (
          <>
            <p className="error">{error}</p>
            <Link className="btn secondary" to="/login">
              Back to login
            </Link>
          </>
        ) : (
          <p>Signing you in with Google…</p>
        )}
      </div>
    </div>
  );
}
