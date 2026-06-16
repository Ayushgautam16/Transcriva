import { useState, useEffect, useRef } from 'react';
import {
  FileText, CheckSquare, Key, AlertTriangle,
  Loader2, Send, Trash2, Download, Copy, Check, UploadCloud,
  ChevronDown, ChevronUp, Cpu, Globe, MessageSquare, Sparkles,
  Zap, Brain, Mic2
} from 'lucide-react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [inputMethod, setInputMethod] = useState('YouTube URL');
  const [source, setSource] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [language, setLanguage] = useState('english');
  const [whisperModel, setWhisperModel] = useState('small');

  const [mistralKey, setMistralKey] = useState('');
  const [sarvamKey, setSarvamKey] = useState('');
  const [mistralConfigured, setMistralConfigured] = useState(false);
  const [sarvamConfigured, setSarvamConfigured] = useState(false);

  const [cookiesFile, setCookiesFile] = useState('');
  const [cookiesBrowser, setCookiesBrowser] = useState('');

  const [apiKeysExpanded, setApiKeysExpanded] = useState(false);
  const [ytAdvancedExpanded, setYtAdvancedExpanded] = useState(false);

  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [steps, setSteps] = useState({
    audio: 'pending', transcript: 'pending', title: 'pending',
    summary: 'pending', extract: 'pending', rag: 'pending',
  });
  const [result, setResult] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(data.status);
      setError(data.error);
      setSteps(data.steps);
      setResult(data.result);
      setChatHistory(data.chat_history || []);
      setMistralConfigured(data.mistral_configured || false);
      setSarvamConfigured(data.sarvam_configured || false);
    } catch (err) {
      console.error('Failed to fetch pipeline status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    let intervalId;
    if (status === 'running') {
      intervalId = setInterval(fetchStatus, 1500);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [status]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setUploadProgress(10); setUploadedFile(file);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      setSource(data.filepath); setUploadProgress(100);
    } catch (err) {
      alert('Failed to upload file.'); setUploadedFile(null);
    } finally { setUploading(false); }
  };

  const handleAnalyze = async () => {
    if (!source.trim()) { alert('Please provide a valid input source.'); return; }
    setError(null);
    const formData = new FormData();
    formData.append('source', source.trim());
    formData.append('language', language);
    formData.append('whisper_model', whisperModel);
    formData.append('source_type', inputMethod);
    if (cookiesFile) formData.append('youtube_cookies_file', cookiesFile);
    if (cookiesBrowser) formData.append('youtube_cookies_browser', cookiesBrowser);
    if (mistralKey) formData.append('user_mistral_key', mistralKey);
    if (sarvamKey) formData.append('user_sarvam_key', sarvamKey);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed to start'); }
      setStatus('running');
    } catch (err) { alert(err.message); }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!question.trim() || chatLoading) return;
    const query = question.trim();
    setQuestion(''); setChatLoading(true);
    setChatHistory(prev => [...prev, { role: 'user', content: query }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Chat failed'); }
      await fetchStatus();
    } catch (err) { alert(err.message); }
    finally { setChatLoading(false); }
  };

  const handleClearChat = async () => {
    try { await fetch('/api/clear-chat', { method: 'POST' }); setChatHistory([]); }
    catch (err) { console.error(err); }
  };

  const handleCopyTranscript = () => {
    if (!result?.transcript) return;
    navigator.clipboard.writeText(result.transcript);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownloadTranscript = () => {
    if (!result?.transcript) return;
    const element = document.createElement('a');
    const file = new Blob([result.transcript], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${result.title.replace(/\s+/g, '_')}_transcript.txt`;
    document.body.appendChild(element); element.click(); document.body.removeChild(element);
  };

  const isSarvamKeyMissing = language === 'hinglish' && !sarvamKey && !sarvamConfigured && !result;
  const isMistralKeyMissing = !mistralKey && !mistralConfigured && !result;

  const timelineSteps = [
    { key: 'audio',      icon: <Mic2 size={10} />,       label: 'Audio Processing' },
    { key: 'transcript', icon: <FileText size={10} />,    label: 'Transcription' },
    { key: 'title',      icon: <Sparkles size={10} />,    label: 'Title Generation' },
    { key: 'summary',    icon: <CheckSquare size={10} />, label: 'Summarisation' },
    { key: 'extract',    icon: <Key size={10} />,         label: 'Extraction' },
    { key: 'rag',        icon: <Brain size={10} />,       label: 'RAG Engine' },
  ];

  const tabs = [
    { id: 'overview',    icon: '📊', label: 'Overview' },
    { id: 'insights',    icon: '🎯', label: 'Key Insights' },
    { id: 'transcript',  icon: '📝', label: 'Transcript' },
    { id: 'chat',        icon: '💬', label: 'Chat Assistant' },
  ];

  return (
    <div className="app-container">

      {/* ───── SIDEBAR ───── */}
      <aside className="sidebar">

        {/* Logo */}
        <div className="logo-section">
          <div className="logo-icon-wrap">🎬</div>
          <div>
            <h1 className="logo-title">Transcriva</h1>
            <p className="logo-sub">Meeting Intelligence</p>
          </div>
        </div>

        <hr className="divider" />

        {/* Input Source */}
        <div className="sidebar-group">
          <label className="group-label">📡 Input Source</label>
          <div className="radio-group">
            {['YouTube URL', 'Upload Audio/Video', 'Local File Path'].map((method) => (
              <label
                key={method}
                className={`radio-label ${inputMethod === method ? 'active' : ''}`}
                onClick={() => { setInputMethod(method); setSource(''); setUploadedFile(null); }}
              >
                <input type="radio" name="input-method" checked={inputMethod === method} readOnly />
                <span>{method}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Dynamic Input */}
        <div className="sidebar-group">
          {inputMethod === 'YouTube URL' && (
            <input
              type="text" className="text-input"
              placeholder="https://youtube.com/watch?v=..."
              value={source} onChange={(e) => setSource(e.target.value)}
              disabled={status === 'running'}
            />
          )}
          {inputMethod === 'Upload Audio/Video' && (
            <div className="upload-container">
              <label className="upload-box">
                <UploadCloud className="upload-icon" />
                <span className="upload-text">
                  {uploadedFile ? uploadedFile.name : 'Click to select file'}
                </span>
                <span className="upload-formats">mp3 · wav · m4a · mp4</span>
                <input type="file" accept=".mp3,.wav,.m4a,.mp4" onChange={handleFileUpload}
                  style={{ display: 'none' }} disabled={status === 'running'} />
              </label>
              {uploading && (
                <div className="upload-progress-bar">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
          )}
          {inputMethod === 'Local File Path' && (
            <input
              type="text" className="text-input"
              placeholder="C:\path\to\file.mp3"
              value={source} onChange={(e) => setSource(e.target.value)}
              disabled={status === 'running'}
            />
          )}
        </div>

        {/* Language */}
        <div className="sidebar-group">
          <label className="group-label">🌐 Language</label>
          <div className="select-container">
            <Globe className="select-icon" />
            <select className="select-input" value={language}
              onChange={(e) => setLanguage(e.target.value)} disabled={status === 'running'}>
              <option value="english">English</option>
              <option value="hinglish">Hinglish</option>
            </select>
          </div>
        </div>

        {/* Whisper Model */}
        {language === 'english' && (
          <div className="sidebar-group">
            <label className="group-label">⚡ Whisper Model</label>
            <div className="select-container">
              <Cpu className="select-icon" />
              <select className="select-input" value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value)} disabled={status === 'running'}>
                <option value="tiny">🚀 Tiny — Fastest</option>
                <option value="base">⚡ Base — Fast</option>
                <option value="small">⚖️ Small — Balanced</option>
                <option value="medium">🎯 Medium — Accurate</option>
              </select>
            </div>
          </div>
        )}

        {/* API Keys */}
        <div className="collapsible-panel">
          <button className="collapsible-header" onClick={() => setApiKeysExpanded(!apiKeysExpanded)}>
            <span className="panel-title">🔑 API Keys</span>
            {apiKeysExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {apiKeysExpanded && (
            <div className="panel-body">
              <div className="input-field">
                <span className="field-label">Mistral API Key</span>
                <input type="password"
                  placeholder={mistralConfigured ? 'Saved (••••••••)' : 'Paste Mistral Key'}
                  value={mistralKey} onChange={(e) => setMistralKey(e.target.value)}
                  disabled={status === 'running'} />
              </div>
              <div className="input-field">
                <span className="field-label">Sarvam API Key</span>
                <input type="password"
                  placeholder={sarvamConfigured ? 'Saved (••••••••)' : 'Paste Sarvam Key'}
                  value={sarvamKey} onChange={(e) => setSarvamKey(e.target.value)}
                  disabled={status === 'running'} />
              </div>
            </div>
          )}
        </div>

        {/* YouTube Settings */}
        <div className="collapsible-panel">
          <button className="collapsible-header" onClick={() => setYtAdvancedExpanded(!ytAdvancedExpanded)}>
            <span className="panel-title">🌐 YouTube Settings</span>
            {ytAdvancedExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {ytAdvancedExpanded && (
            <div className="panel-body">
              <div className="input-field">
                <span className="field-label">Cookies File Path</span>
                <input type="text" placeholder="C:\path\to\cookies.txt"
                  value={cookiesFile} onChange={(e) => setCookiesFile(e.target.value)}
                  disabled={status === 'running'} />
              </div>
              <div className="input-field">
                <span className="field-label">Browser Cookies</span>
                <select value={cookiesBrowser} onChange={(e) => setCookiesBrowser(e.target.value)}
                  disabled={status === 'running'}>
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
        {isSarvamKeyMissing && (
          <div className="alert alert-warning">
            <AlertTriangle className="alert-icon" />
            <span>Sarvam Key required for Hinglish. Add in Keys panel.</span>
          </div>
        )}
        {isMistralKeyMissing && (
          <div className="alert alert-warning">
            <AlertTriangle className="alert-icon" />
            <span>Mistral Key required for RAG &amp; Summary.</span>
          </div>
        )}

        {/* Analyse Button */}
        <button
          className="btn btn-primary btn-analyze"
          onClick={handleAnalyze}
          disabled={status === 'running' || uploading || !source}
        >
          {status === 'running' ? (
            <><Loader2 className="spinner" /><span>Analyzing…</span></>
          ) : (
            <><Zap size={15} /><span>Analyse</span></>
          )}
        </button>

        <hr className="divider" />

        {/* Pipeline Timeline */}
        <div className="timeline-header">
          <span className="badge badge-purple">Pipeline Status</span>
        </div>
        <div className="timeline-container">
          {timelineSteps.map((step) => {
            const state = steps[step.key] || 'pending';
            return (
              <div key={step.key} className={`timeline-item ${state}`}>
                <div className="timeline-badge">
                  {state === 'done' ? '✓' : state === 'active' ? step.icon : '○'}
                </div>
                <div className="timeline-content">{step.label}</div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ───── MAIN CONTENT ───── */}
      <main className="main-content">
        <header className="main-header">
          <div>
            <h1 className="hero-title">Transcriva AI</h1>
            <p className="hero-sub">Transcribe · Summarise · Chat with your meetings</p>
          </div>
          <div className="header-pills">
            {status === 'running' && (
              <span className="pill pill-purple">
                <span className="pill-dot" /> Processing
              </span>
            )}
            {status === 'completed' && (
              <span className="pill pill-green">
                <span className="pill-dot" /> Complete
              </span>
            )}
          </div>
        </header>

        <hr className="divider" />

        {/* ── RUNNING STATE ── */}
        {status === 'running' && (
          <div className="running-state">
            <div className="running-orb">
              <div className="running-orb-inner">🧠</div>
            </div>
            <h3 className="pulse-text">Pipeline Processing…</h3>
            <p className="sub-text">Track live progress in the sidebar timeline.</p>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {status === 'failed' && (
          <div className="error-state">
            <div className="error-icon-wrap">❌</div>
            <h3 className="error-title">Analysis Failed</h3>
            <div className="error-msg">{error}</div>
            <p className="sub-text">Check your connection, cookie paths, or API keys and retry.</p>
          </div>
        )}

        {/* ── RESULT STATE ── */}
        {status === 'completed' && result && (
          <div className="result-container animate-fade-in">

            {/* Title Card */}
            <div className="title-card">
              <div className="title-card-label">📌 Session Title</div>
              <h2 className="session-title">{result.title}</h2>
            </div>

            {/* Tab Nav */}
            <div className="tabs-nav" data-testid="stTabBar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  data-baseweb="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="tab-pane animate-fade-in">
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-value">{result.source_type || 'Unknown'}</div>
                    <div className="metric-label">Source Type</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value" style={{ textTransform: 'capitalize' }}>{language}</div>
                    <div className="metric-label">Language</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">✅ Done</div>
                    <div className="metric-label">Status</div>
                  </div>
                </div>

                <div className="overview-split">
                  <div className="card summary-card">
                    <div className="card-title">📋 Executive Summary</div>
                    <div className="card-content markdown-body">
                      {result.summary.split('\n').map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                  </div>
                  <div className="card media-card">
                    <div className="card-title">📺 Media Reference</div>
                    <div className="media-player-container">
                      {result.source_path.startsWith('http') ? (
                        <iframe
                          className="youtube-iframe"
                          src={`https://www.youtube.com/embed/${new URL(result.source_path).searchParams.get('v')}`}
                          title="YouTube video player" frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <audio controls src={`/api/media?path=${encodeURIComponent(result.source_path)}`}
                          className="audio-player" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Insights Tab */}
            {activeTab === 'insights' && (
              <div className="tab-pane animate-fade-in">
                <div className="insights-grid">
                  <div className="card">
                    <div className="card-title">✅ Action Items</div>
                    <div className="markdown-body">
                      {result.action_items.split('\n').map((line, i) => (
                        <div key={i} className="insight-line">{line}</div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-title">🔑 Key Decisions</div>
                    <div className="markdown-body">
                      {result.key_decisions.split('\n').map((line, i) => (
                        <div key={i} className="insight-line">{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">❓ Open Questions</div>
                  <div className="markdown-body">
                    {result.open_questions.split('\n').map((line, i) => (
                      <div key={i} className="insight-line">{line}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Transcript Tab */}
            {activeTab === 'transcript' && (
              <div className="tab-pane animate-fade-in">
                <div className="card transcript-card">
                  <div className="card-title">📝 Full Transcript</div>
                  <div className="transcript-box">{result.transcript}</div>
                  <div className="transcript-actions">
                    <button className="btn btn-secondary btn-icon-text" onClick={handleCopyTranscript}>
                      {copySuccess ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button className="btn btn-secondary btn-icon-text" onClick={handleDownloadTranscript}>
                      <Download size={14} />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <div className="tab-pane animate-fade-in">
                <div className="chat-layout">
                  <div className="chat-header">
                    <div className="chat-header-left">
                      <h3><MessageSquare size={16} /> Chat with your Meeting</h3>
                      <p>Ask anything about the transcript using natural language.</p>
                    </div>
                  </div>

                  <div className="chat-box">
                    {chatHistory.length === 0 ? (
                      <div className="chat-empty-state">
                        <MessageSquare className="chat-placeholder-icon" />
                        <p className="chat-empty-title">Start a conversation</p>
                        <p className="chat-empty-desc">Ask about decisions, action items, or any detail from the meeting.</p>
                      </div>
                    ) : (
                      <div className="chat-messages-list">
                        {chatHistory.map((msg, index) => (
                          <div
                            key={index}
                            className="chat-message"
                            data-testid="stChatMessage"
                            data-test-role={msg.role}
                          >
                            <div className="chat-msg-avatar">
                              {msg.role === 'user' ? '👤' : '🤖'}
                            </div>
                            <div className="chat-msg-body">
                              <p className="chat-msg-role-name">
                                {msg.role === 'user' ? 'You' : 'Assistant'}
                              </p>
                              <p className="chat-msg-text">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="chat-message" data-testid="stChatMessage">
                            <div className="chat-msg-avatar">🤖</div>
                            <div className="chat-msg-body">
                              <p className="chat-msg-role-name">Assistant</p>
                              <div className="chat-thinking">
                                <div className="thinking-dot" />
                                <div className="thinking-dot" />
                                <div className="thinking-dot" />
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>

                  <form className="chat-input-form" onSubmit={handleSendChat}>
                    <input
                      type="text" className="chat-text-input"
                      placeholder="What were the main decisions made?"
                      value={question} onChange={(e) => setQuestion(e.target.value)}
                      disabled={chatLoading}
                    />
                    <button type="submit" className="btn btn-primary btn-chat-send"
                      disabled={chatLoading || !question.trim()}>
                      <Send size={15} />
                    </button>
                  </form>

                  {chatHistory.length > 0 && (
                    <button className="btn btn-secondary btn-clear-chat" onClick={handleClearChat}>
                      <Trash2 size={13} />
                      <span>Clear History</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── IDLE STATE ── */}
        {status === 'idle' && !result && (
          <div className="idle-state animate-fade-in">
            <div className="idle-glow-ring">
              <div className="idle-icon-inner">🎬</div>
            </div>
            <h2 className="idle-title">Ready to Analyze</h2>
            <p className="idle-desc">
              Provide a YouTube URL, upload an audio/video file, or specify a local path in the sidebar.
              We'll transcribe, summarize, and power an interactive Q&amp;A assistant.
            </p>
            <div className="badge-row">
              <span className="badge badge-purple">🎙️ Transcription</span>
              <span className="badge badge-cyan">📋 Summarization</span>
              <span className="badge badge-green">🧠 RAG Chat</span>
              <span className="badge badge-pink">⚡ Real-time</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
