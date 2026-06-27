import { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle, Loader2, Send, Trash2, Download,
  Copy, Check, UploadCloud, ChevronDown, ChevronUp,
  MessageSquare, Zap, ClipboardList, LogOut, User, LayoutDashboard
} from 'lucide-react';
import './App.css';
import LoginPage from './LoginPage';
import ProfilePage from './ProfilePage';
import TaskAssignModal from './TaskAssignModal';
import TaskManagementPage from './TaskManagementPage';

/* ── Floating particle colours ── */
const PARTICLE_COLORS = ['#EF9F27','#D85A30','#FAC775','#BA7517','#F5C4B3','#FAEEDA'];

function Particles() {
  const items = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      id: i,
      size: 10 + Math.random() * 22,
      left: 5 + Math.random() * 90,
      bottom: Math.random() * 20,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      dur: `${4 + Math.random() * 5}s`,
      delay: `${Math.random() * 6}s`,
      opacity: 0.55 + Math.random() * 0.35,
    }));
  }, []);

  return (
    <div className="particles-layer">
      {items.map(p => (
        <div key={p.id} className="particle" style={{
          width: p.size,
          height: p.size,
          left: `${p.left}%`,
          bottom: `${p.bottom}%`,
          background: p.color,
          '--dur': p.dur,
          '--delay': p.delay,
          '--p-color': p.color,
        }} />
      ))}
    </div>
  );
}

/* ── Pipeline step state helper ── */
function stepClass(s) {
  if (s === 'done')   return 'done';
  if (s === 'active') return 'active';
  return 'idle';
}

export default function App() {
  /* ── Auth State ── */
  const [currentUser, setCurrentUser] = useState(() => {
    try { const u = localStorage.getItem('transcriva_user'); return u ? JSON.parse(u) : null; }
    catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('transcriva_token') || null);
  const [showProfile, setShowProfile] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTaskBoard, setShowTaskBoard] = useState(false);

  const handleLogin = (user, tok) => {
    setCurrentUser(user);
    setToken(tok);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    localStorage.removeItem('transcriva_token');
    localStorage.removeItem('transcriva_user');
    setCurrentUser(null);
    setToken(null);
  };

  /* ── UI State ── */
  const [activeTab, setActiveTab]   = useState('overview');
  const [inputMethod, setInputMethod] = useState('YouTube URL');
  const [source, setSource]         = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [language, setLanguage]     = useState('english');
  const [whisperModel, setWhisperModel] = useState('small');

  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('transcriva-theme') === 'dark'; }
    catch { return false; }
  });

  const [mistralKey, setMistralKey]         = useState('');
  const [sarvamKey, setSarvamKey]           = useState('');
  const [mistralConfigured, setMistralConfigured] = useState(false);
  const [sarvamConfigured, setSarvamConfigured]   = useState(false);

  const [cookiesFile, setCookiesFile]       = useState('');
  const [cookiesBrowser, setCookiesBrowser] = useState('');

  const [apiOpen, setApiOpen] = useState(false);
  const [ytOpen,  setYtOpen]  = useState(false);


  // Apply dark mode class to body
  useEffect(() => {
    document.body.classList.toggle('dark', isDark);
    try { localStorage.setItem('transcriva-theme', isDark ? 'dark' : 'light'); }
    catch {}
  }, [isDark]);

  const toggleTheme = () => setIsDark(d => !d);

  const [status, setStatus] = useState('idle');
  const [error,  setError]  = useState(null);
  const [steps,  setSteps]  = useState({
    audio: 'pending', transcript: 'pending', title: 'pending',
    summary: 'pending', extract: 'pending', rag: 'pending',
  });
  const [result, setResult]         = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [question, setQuestion]     = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [copied, setCopied]         = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  /* ── API helpers ── */
  const fetchStatus = async () => {
    try {
      const d = await (await fetch('/api/status')).json();
      setStatus(d.status); setError(d.error); setSteps(d.steps);
      setResult(d.result); setChatHistory(d.chat_history || []);
      setMistralConfigured(d.mistral_configured || false);
      setSarvamConfigured(d.sarvam_configured || false);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchStatus();
    let id;
    if (status === 'running') id = setInterval(fetchStatus, 1500);
    return () => clearInterval(id);
  }, [status]);

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true); setUploadProgress(10); setUploadedFile(file);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('Upload failed');
      const d = await r.json(); setSource(d.filepath); setUploadProgress(100);
    } catch { alert('Upload failed.'); setUploadedFile(null); }
    finally { setUploading(false); }
  };

  const handleAnalyze = async () => {
    if (!source.trim()) { alert('Please provide a source.'); return; }
    setError(null);
    const fd = new FormData();
    fd.append('source', source.trim()); fd.append('language', language);
    fd.append('whisper_model', whisperModel); fd.append('source_type', inputMethod);
    if (cookiesFile)    fd.append('youtube_cookies_file', cookiesFile);
    if (cookiesBrowser) fd.append('youtube_cookies_browser', cookiesBrowser);
    if (mistralKey)     fd.append('user_mistral_key', mistralKey);
    if (sarvamKey)      fd.append('user_sarvam_key', sarvamKey);
    try {
      const r = await fetch('/api/analyze', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Failed'); }
      setStatus('running');
    } catch (e) { alert(e.message); }
  };

  const handleChat = async (e) => {
    e.preventDefault(); if (!question.trim() || chatLoading) return;
    const q = question.trim(); setQuestion(''); setChatLoading(true);
    setChatHistory(p => [...p, { role: 'user', content: q }]);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Failed'); }
      await fetchStatus();
    } catch (e) { alert(e.message); }
    finally { setChatLoading(false); }
  };

  const handleClearChat = async () => {
    try { await fetch('/api/clear-chat', { method: 'POST' }); setChatHistory([]); }
    catch (e) { console.error(e); }
  };

  const handleCopy = () => {
    if (!result?.transcript) return;
    navigator.clipboard.writeText(result.transcript);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result?.transcript) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([result.transcript], { type: 'text/plain' }));
    a.download = `${result.title.replace(/\s+/g, '_')}_transcript.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  /* ── Pipeline step definitions ── */
  const pipelineSteps = [
    { key: 'audio',      icon: '🔊', label: 'Audio Processing' },
    { key: 'transcript', icon: '🎙', label: 'Transcription' },
    { key: 'title',      icon: '✨', label: 'Title Generation' },
    { key: 'summary',    icon: '📋', label: 'Summarisation' },
    { key: 'extract',    icon: '🔍', label: 'Extraction' },
    { key: 'rag',        icon: '🤖', label: 'RAG Engine' },
  ];

  /* ── Step cards for running state ── */
  const runningCards = [
    { key: 'audio',      icon: '✅', label: 'Audio' },
    { key: 'transcript', icon: '🎙', label: 'Transcribing' },
    { key: 'summary',    icon: '✨', label: 'Summary' },
    { key: 'rag',        icon: '🤖', label: 'RAG Engine' },
  ];

  const cardState = (key) => {
    const s = steps[key];
    if (s === 'done')   return 'complete';
    if (s === 'active') return 'running';
    return 'pending';
  };
  const cardStatus = (key) => {
    const s = steps[key];
    if (s === 'done')   return 'Done ✓';
    if (s === 'active') return 'In progress…';
    return 'Waiting';
  };

  const tabs = [
    { id: 'overview',   label: 'Summary' },
    { id: 'insights',   label: 'Key Points' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'chat',       label: 'Chat' },
  ];

  const isAnalyzing = status === 'running';

  /* ── Auth gate ── */
  if (!currentUser || !token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  /* ── Task Board full-page view ── */
  if (showTaskBoard) {
    return (
      <>
        {showProfile && (
          <ProfilePage
            currentUser={currentUser}
            token={token}
            onClose={() => setShowProfile(false)}
          />
        )}
        <TaskManagementPage
          token={token}
          currentUser={currentUser}
          onBack={() => setShowTaskBoard(false)}
        />
      </>
    );
  }

  return (
    <>
      {/* Profile overlay */}
      {showProfile && (
        <ProfilePage
          currentUser={currentUser}
          token={token}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Task Assign modal */}
      {showTaskModal && result && (
        <TaskAssignModal
          result={result}
          token={token}
          currentUser={currentUser}
          onClose={() => setShowTaskModal(false)}
        />
      )}

    <div className="app-container">

      {/* ═══ SIDEBAR ═══ */}
      <aside className="sidebar">

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-row">
            <div className="logo-icon-box">🎙</div>
            <div>
              <div className="logo-name">Transcriva</div>
              <div className="logo-sub">Meeting Intelligence</div>
            </div>
          </div>

          {/* User chip */}
          <div className="sidebar-user-chip">
            <span className="suc-avatar">{currentUser.avatar}</span>
            <div className="suc-info">
              <div className="suc-name">{currentUser.display_name}</div>
              <div className="suc-role">{currentUser.role === 'admin' ? '👑 Admin' : '👤 Member'}</div>
            </div>
          </div>
        </div>

        <div className="sidebar-body">

          {/* My Tasks nav */}
          <button className="my-tasks-btn" onClick={() => setShowProfile(true)}>
            <ClipboardList size={14} />
            My Tasks
          </button>

          {/* Task Board nav */}
          <button className="task-board-btn" onClick={() => setShowTaskBoard(true)}>
            <LayoutDashboard size={14} />
            Task Board
          </button>

          {/* Input Source */}
          <div className="sidebar-section-label">Input Source</div>
          {['YouTube URL', 'Upload Audio/Video', 'Local File Path'].map(m => (
            <div
              key={m} className={`input-opt ${inputMethod === m ? 'active' : ''}`}
              onClick={() => { setInputMethod(m); setSource(''); setUploadedFile(null); }}
            >
              <div className={`radio-circle ${inputMethod === m ? 'active' : ''}`} />
              <span className="opt-text">{m}</span>
            </div>
          ))}

          {/* Source input */}
          {inputMethod === 'YouTube URL' && (
            <div className="sb-input-wrap">
              <input className="sb-input" type="text"
                placeholder="https://youtube.com/watch?v=..."
                value={source} onChange={e => setSource(e.target.value)}
                disabled={isAnalyzing} />
            </div>
          )}
          {inputMethod === 'Local File Path' && (
            <div className="sb-input-wrap">
              <input className="sb-input" type="text"
                placeholder="C:\path\to\file.mp3"
                value={source} onChange={e => setSource(e.target.value)}
                disabled={isAnalyzing} />
            </div>
          )}
          {inputMethod === 'Upload Audio/Video' && (
            <div className="sb-input-wrap">
              <label className="sb-upload-box">
                <UploadCloud size={18} color="var(--warm-amber)" />
                <span className="sb-upload-text">
                  {uploadedFile ? uploadedFile.name : 'Click to select file'}
                </span>
                <span className="sb-upload-fmt">mp3 · wav · m4a · mp4</span>
                <input type="file" accept=".mp3,.wav,.m4a,.mp4"
                  onChange={handleUpload} style={{ display: 'none' }}
                  disabled={isAnalyzing} />
              </label>
              {uploading && (
                <div className="sb-progress">
                  <div className="sb-progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Language */}
          <div className="sb-setting">
            <div className="sb-setting-label">🌐 Language</div>
            <select className="sb-select" value={language}
              onChange={e => setLanguage(e.target.value)} disabled={isAnalyzing}>
              <option value="english">English</option>
              <option value="hinglish">Hinglish</option>
            </select>
          </div>

          {/* Whisper Model */}
          {language === 'english' && (
            <div className="sb-setting">
              <div className="sb-setting-label">⚡ Whisper Model</div>
              <select className="sb-select" value={whisperModel}
                onChange={e => setWhisperModel(e.target.value)} disabled={isAnalyzing}>
                <option value="tiny">🚀 Tiny — Fastest</option>
                <option value="base">⚡ Base — Fast</option>
                <option value="small">⚖️ Small — Balanced</option>
                <option value="medium">🎯 Medium — Accurate</option>
              </select>
            </div>
          )}

          {/* API Keys */}
          <div style={{ margin: '0 10px 10px' }}>
            <div className="collapsible-row" onClick={() => setApiOpen(o => !o)}>
              <span className="collapsible-row-title">🔑 API Keys</span>
              {apiOpen ? <ChevronUp size={12} color="var(--warm-sidebar-muted)" /> : <ChevronDown size={12} color="var(--warm-sidebar-muted)" />}
            </div>
            {apiOpen && (
              <div className="api-panel">
                <div className="api-row">
                  <span className="api-key-label">Mistral</span>
                  {mistralConfigured && !mistralKey
                    ? <span className="api-saved">✓ Saved</span>
                    : <span className="api-missing">Add Key</span>}
                </div>
                <div className="api-input-wrap">
                  <input className="sb-input" type="password"
                    placeholder={mistralConfigured ? 'Saved (••••••••)' : 'Paste Mistral key…'}
                    value={mistralKey} onChange={e => setMistralKey(e.target.value)}
                    disabled={isAnalyzing} />
                </div>
                <div className="api-row" style={{ marginTop: 8 }}>
                  <span className="api-key-label">Sarvam</span>
                  {sarvamConfigured && !sarvamKey
                    ? <span className="api-saved">✓ Saved</span>
                    : <span className="api-missing">Add Key</span>}
                </div>
                <div className="api-input-wrap">
                  <input className="sb-input" type="password"
                    placeholder={sarvamConfigured ? 'Saved (••••••••)' : 'Paste Sarvam key…'}
                    value={sarvamKey} onChange={e => setSarvamKey(e.target.value)}
                    disabled={isAnalyzing} />
                </div>
              </div>
            )}
          </div>

          {/* YouTube Settings */}
          <div style={{ margin: '0 10px 10px' }}>
            <div className="collapsible-row" onClick={() => setYtOpen(o => !o)}>
              <span className="collapsible-row-title">🌐 YouTube Settings</span>
              {ytOpen ? <ChevronUp size={12} color="var(--warm-sidebar-muted)" /> : <ChevronDown size={12} color="var(--warm-sidebar-muted)" />}
            </div>
            {ytOpen && (
              <div style={{ padding: '8px 0 0' }}>
                <div className="sb-setting">
                  <div className="sb-setting-label">Cookies File</div>
                  <input className="sb-input" type="text"
                    placeholder="C:\path\to\cookies.txt"
                    value={cookiesFile} onChange={e => setCookiesFile(e.target.value)} disabled={isAnalyzing} />
                </div>
                <div className="sb-setting">
                  <div className="sb-setting-label">Browser Cookies</div>
                  <select className="sb-select" value={cookiesBrowser}
                    onChange={e => setCookiesBrowser(e.target.value)} disabled={isAnalyzing}>
                    <option value="">None</option>
                    <option value="chrome">Chrome</option>
                    <option value="edge">Edge</option>
                    <option value="firefox">Firefox</option>
                    <option value="brave">Brave</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Warnings */}
          {language === 'hinglish' && !sarvamKey && !sarvamConfigured && (
            <div style={{ margin: '0 10px 8px', fontSize: 10, color: '#EF9F27',
              background: 'rgba(239,159,39,0.08)', border: '0.5px solid rgba(239,159,39,0.2)',
              borderRadius: 8, padding: '7px 10px', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
              <AlertTriangle size={11} style={{ marginTop: 1, flexShrink: 0 }} />
              Sarvam Key required for Hinglish.
            </div>
          )}

          {/* Analyse Button */}
          <button className="analyze-btn" onClick={handleAnalyze}
            disabled={isAnalyzing || uploading || !source}>
            {isAnalyzing
              ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing…</>
              : <><Zap size={13} /> Analyze Meeting</>}
          </button>
        </div>

        {/* Pipeline Status */}
        <div className="pipeline-section">
          <div className="pipeline-title">Pipeline Status</div>
          {pipelineSteps.map(s => {
            const st = stepClass(steps[s.key]);
            return (
              <div key={s.key} className={`pipeline-step ${st}`}>
                <div className={`step-dot ${st}`}>
                  {st === 'done' ? '✓' : st === 'active' ? '◎' : '◦'}
                </div>
                <span className={`step-label ${st}`}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Logout */}
        <button className="sidebar-logout-btn" onClick={handleLogout}>
          <LogOut size={13} /> Sign Out
        </button>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="main-content">
        <Particles />

        {/* Header */}
        <div className="main-header">
          <div className="main-title">Transcriva AI</div>
          <div className="main-subtitle">Transcribe · Summarise · Chat with your meetings</div>

          {/* Header right controls */}
          <div className="header-right-controls">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
              style={{ position: 'static' }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button className="header-user-btn" onClick={() => setShowProfile(true)} title="My Tasks & Profile">
              <span>{currentUser.avatar}</span>
              <span className="hub-name">{currentUser.display_name}</span>
            </button>
          </div>
          {status === 'completed' && result && (
            <div className="tabs-header-row">
              <div className="tabs-row">
                {tabs.map(t => (
                  <button key={t.id}
                    className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <button className="assign-tasks-btn" onClick={() => setShowTaskModal(true)}>
                <ClipboardList size={13} />
                Assign Tasks
              </button>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="main-body">

          {/* RUNNING */}
          {status === 'running' && (
            <div className="running-state">
              <div className="spinner-wrap">
                <div className="spinner-ring ring1" />
                <div className="spinner-ring ring2" />
                <div className="spinner-ring ring3" />
                <div className="spinner-center" />
              </div>
              <div>
                <div className="processing-title">Pipeline Processing in Progress</div>
                <div className="processing-sub">Analysing your meeting — this usually takes 1–3 minutes</div>
              </div>
              <div className="progress-track">
                <div className="progress-fill-anim" />
              </div>
              <div className="step-cards">
                {runningCards.map(c => (
                  <div key={c.key} className={`step-card ${cardState(c.key)}`}>
                    <span className="sc-icon">{c.icon}</span>
                    <div>
                      <div className="sc-name">{c.label}</div>
                      <div className="sc-status">{cardStatus(c.key)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ERROR */}
          {status === 'failed' && (
            <div className="error-state">
              <div className="error-ring">❌</div>
              <div className="error-title">Analysis Failed</div>
              <div className="error-box">{error}</div>
              <p style={{ fontSize: 12, color: 'var(--warm-muted)', textAlign: 'center' }}>
                Check your input, API keys, or cookies and try again.
              </p>
            </div>
          )}

          {/* IDLE */}
          {status === 'idle' && !result && (
            <div className="idle-state">
              <div className="idle-icon-ring">
                <div className="idle-inner-icon">🎬</div>
              </div>
              <div className="idle-title">Ready to Analyze</div>
              <p className="idle-desc">
                Provide a YouTube URL, upload an audio/video file, or specify a local path in the sidebar.
                We'll transcribe, summarize, and power an interactive Q&amp;A assistant.
              </p>
              <div className="feature-pills">
                <span className="fpill fpill-amber">🎙 Transcription</span>
                <span className="fpill fpill-coral">📋 Summarization</span>
                <span className="fpill fpill-green">🤖 RAG Chat</span>
              </div>
            </div>
          )}

          {/* COMPLETED */}
          {status === 'completed' && result && (
            <div className="result-wrap">

              {/* Title Card */}
              <div className="result-title-card">
                <div className="rtc-label">📌 Session Title</div>
                <div className="rtc-title">{result.title}</div>
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  <div className="metrics-row">
                    <div className="metric-box">
                      <div className="metric-val">{result.source_type || 'Unknown'}</div>
                      <div className="metric-lbl">Source</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-val" style={{ textTransform: 'capitalize' }}>{language}</div>
                      <div className="metric-lbl">Language</div>
                    </div>
                    <div className="metric-box">
                      <div className="metric-val">✅ Done</div>
                      <div className="metric-lbl">Status</div>
                    </div>
                  </div>
                  <div className="overview-grid">
                    <div className="content-card" style={{ overflowY: 'auto', maxHeight: 320 }}>
                      <div className="card-lbl">📋 Executive Summary</div>
                      <div className="card-text">
                        {result.summary.split('\n').map((p, i) => <p key={i} style={{ marginBottom: 8 }}>{p}</p>)}
                      </div>
                    </div>
                    <div className="content-card">
                      <div className="card-lbl">📺 Media Reference</div>
                      <div className="media-frame">
                        {result.source_path.startsWith('http') ? (
                          <iframe className="yt-iframe"
                            src={`https://www.youtube.com/embed/${new URL(result.source_path).searchParams.get('v')}`}
                            title="YouTube video" frameBorder="0" allowFullScreen />
                        ) : (
                          <audio controls className="audio-ctrl"
                            src={`/api/media?path=${encodeURIComponent(result.source_path)}`} />
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Key Points Tab */}
              {activeTab === 'insights' && (
                <>
                  <div className="insights-grid">
                    <div className="content-card">
                      <div className="card-lbl">✅ Action Items</div>
                      {result.action_items.split('\n').map((l, i) => <div key={i} className="insight-line">{l}</div>)}
                    </div>
                    <div className="content-card">
                      <div className="card-lbl">🔑 Key Decisions</div>
                      {result.key_decisions.split('\n').map((l, i) => <div key={i} className="insight-line">{l}</div>)}
                    </div>
                  </div>
                  <div className="content-card">
                    <div className="card-lbl">❓ Open Questions</div>
                    {result.open_questions.split('\n').map((l, i) => <div key={i} className="insight-line">{l}</div>)}
                  </div>
                </>
              )}

              {/* Transcript Tab */}
              {activeTab === 'transcript' && (
                <div className="content-card transcript-card">
                  <div className="card-lbl">📝 Full Transcript</div>
                  <div className="transcript-box">{result.transcript}</div>
                  <div className="transcript-actions">
                    <button className="btn-sm btn-outline" onClick={handleCopy}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button className="btn-sm btn-outline" onClick={handleDownload}>
                      <Download size={13} /> Download .txt
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Tab */}
              {activeTab === 'chat' && (
                <div className="chat-wrap">
                  <div className="chat-head">
                    <h3>💬 Chat with your Meeting</h3>
                    <p>Ask anything about the transcript in natural language.</p>
                  </div>

                  <div className="chat-messages">
                    {chatHistory.length === 0 ? (
                      <div className="chat-empty">
                        <div className="chat-empty-icon"><MessageSquare size={32} /></div>
                        <div className="chat-empty-lbl">Start a conversation</div>
                        <div className="chat-empty-sub">Ask about decisions, action items, or any meeting detail.</div>
                      </div>
                    ) : (
                      chatHistory.map((msg, i) => (
                        <div key={i} className={`chat-msg ${msg.role}`}>
                          <div className="msg-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
                          <div>
                            <div className="msg-role">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                            <div className="msg-text">{msg.content}</div>
                          </div>
                        </div>
                      ))
                    )}
                    {chatLoading && (
                      <div className="chat-msg assistant">
                        <div className="msg-avatar">🤖</div>
                        <div>
                          <div className="msg-role">Assistant</div>
                          <div className="thinking-dots">
                            <div className="t-dot" />
                            <div className="t-dot" />
                            <div className="t-dot" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form className="chat-form" onSubmit={handleChat}>
                    <input className="chat-input" type="text"
                      placeholder="What were the main decisions made?"
                      value={question} onChange={e => setQuestion(e.target.value)}
                      disabled={chatLoading} />
                    <button type="submit" className="chat-send-btn"
                      disabled={chatLoading || !question.trim()}>
                      <Send size={15} />
                    </button>
                  </form>

                  {chatHistory.length > 0 && (
                    <button className="clear-chat-btn" onClick={handleClearChat}>
                      <Trash2 size={12} /> Clear History
                    </button>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
    </>
  );
}
