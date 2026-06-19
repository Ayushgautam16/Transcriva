import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const DEMO_USERS = [
  { username: 'ayush',  password: 'ayush123',  display: 'Ayush',  avatar: '🧑‍💻', role: 'Admin',  color: '#EF9F27' },
  { username: 'anujha', password: 'anujha123', display: 'Anujha', avatar: '👩‍💼', role: 'Member', color: '#D85A30' },
  { username: 'maria',  password: 'maria123',  display: 'Maria',  avatar: '👩‍🔬', role: 'Member', color: '#BA7517' },
  { username: 'rahul',  password: 'rahul123',  display: 'Rahul',  avatar: '👨‍💼', role: 'Member', color: '#c0783b' },
];

export default function LoginPage({ onLogin }) {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');
  const [quickLoading, setQuickLoading] = useState('');

  const doLogin = async (u, p) => {
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Login failed');
      }
      const data = await res.json();
      localStorage.setItem('transcriva_token', data.token);
      localStorage.setItem('transcriva_user', JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    await doLogin(username.trim().toLowerCase(), password);
    setLoading(false);
  };

  const handleQuick = async (u) => {
    setQuickLoading(u.username);
    await doLogin(u.username, u.password);
    setQuickLoading('');
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-orb orb1" />
      <div className="login-orb orb2" />
      <div className="login-orb orb3" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">🎙</div>
          <div>
            <div className="login-logo-name">Transcriva</div>
            <div className="login-logo-sub">Meeting Intelligence Platform</div>
          </div>
        </div>

        <div className="login-divider" />

        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Sign in to access your meeting workspace</p>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">Username</label>
            <input
              id="login-username"
              className="login-input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>
          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              id="login-password"
              className="login-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error">
              ⚠️ {error}
            </div>
          )}

          <button id="login-submit-btn" className="login-btn" type="submit" disabled={loading}>
            {loading
              ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Signing in…</>
              : '→ Sign In'}
          </button>
        </form>

        <div className="login-quick-label">
          <span>Quick Login — Demo Accounts</span>
        </div>

        {/* Demo user cards */}
        <div className="login-quick-grid">
          {DEMO_USERS.map(u => (
            <button
              key={u.username}
              id={`quick-login-${u.username}`}
              className="login-quick-card"
              onClick={() => handleQuick(u)}
              disabled={!!quickLoading || loading}
              style={{ '--card-color': u.color }}
            >
              {quickLoading === u.username
                ? <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: u.color }} />
                : <span className="quick-avatar">{u.avatar}</span>}
              <div className="quick-info">
                <div className="quick-name">{u.display}</div>
                <div className="quick-role">{u.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
