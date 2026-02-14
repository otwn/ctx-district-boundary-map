import { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../lib/auth';

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: () => Promise<void>;
  onAuthError?: (message: string) => void;
};

export default function AuthModal({ isOpen, onClose, onAuthSuccess, onAuthError }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) {
    return null;
  }

  const runAuth = async (mode: 'login' | 'register') => {
    setError('');
    setStatus('Working...');

    const action = mode === 'login' ? signInWithPassword : signUpWithPassword;
    const result = await action(email, password);

    if (!result.ok) {
      setStatus('');
      setError(result.message);
      onAuthError?.(result.message);
      return;
    }

    setStatus(mode === 'login' ? 'Logged in.' : 'Registered. Check email if confirmation is required.');
    await onAuthSuccess();
  };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Login or Register</h2>
        <form onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="auth-email">
            Email
            <input
              id="auth-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label htmlFor="auth-password">
            Password
            <input
              id="auth-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>

          <div className="auth-row">
            <button className="primary" type="button" onClick={() => void runAuth('login')}>
              Login
            </button>
            <button type="button" onClick={() => void runAuth('register')}>
              Register
            </button>
            <button type="button" className="danger" onClick={onClose}>
              Close
            </button>
          </div>

          <div className={`status ${error ? 'error' : ''}`}>{error || status}</div>
        </form>
      </div>
    </div>
  );
}
