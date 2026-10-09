import React, { useState } from 'react';

export default function AccountPanel({ authStatus, authError, user, onLogin, onSignOut }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onLogin(email, password);
  }

  // ── Signed-in state ───────────────────────────────────────────────────────
  if (authStatus === 'signed-in') {
    const rawName = user?.name || user?.email || '';
    const initial = rawName.charAt(0).toUpperCase() || '?';
    const displayName = user?.name || user?.email || 'Operator';

    return (
      <section className="account-section">
        <p className="section-header">ACCOUNT</p>
        <div className="account-identity">
          <div className="account-avatar" aria-hidden="true">{initial}</div>
          <span className="account-name">{displayName}</span>
        </div>
        <button
          type="button"
          className="text-link"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </section>
    );
  }

  // ── Signed-out / signing-in / error state ─────────────────────────────────
  const isLoading = authStatus === 'signing-in';

  return (
    <section className="account-section">
      <p className="section-header">ACCOUNT</p>
      <form className="sign-in-form" onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="signin-email">Email</label>
          <input
            id="signin-email"
            type="email"
            className="form-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            autoComplete="email"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="signin-password">Password</label>
          <input
            id="signin-password"
            type="password"
            className="form-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password"
            required
          />
        </div>

        {authError && (
          <p className="form-error" role="alert">{authError}</p>
        )}

        <div className="sign-in-btn-row">
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading
              ? <span className="spinner" role="status" aria-label="Signing in" />
              : 'Sign in'}
          </button>
        </div>
      </form>
    </section>
  );
}
