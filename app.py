import streamlit as st
import time
import os

from dotenv import load_dotenv
from utils.audio_processor import process_input
from core.transcriber import transcribe_all
from core.summarizer import summarize, generate_title
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.rag_engine import build_rag_chain, ask_question

load_dotenv()

# ─── Page Config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Transcriva AI - Meeting Intelligence",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');

/* ── Root Variables ── */
:root {
    --bg: #03030c;
    --surface: rgba(17, 17, 26, 0.7);
    --surface-2: rgba(25, 25, 38, 0.55);
    --border: rgba(124, 58, 237, 0.15);
    --border-hover: rgba(124, 58, 237, 0.35);
    --accent: #7c3aed;
    --accent-glow: rgba(124, 58, 237, 0.4);
    --accent-glow-strong: rgba(124, 58, 237, 0.75);
    --accent-2: #06b6d4;
    --text: #f3f4f6;
    --text-muted: #9ca3af;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
}

/* ── Global Reset ── */
html, body, [class*="css"] {
    font-family: 'Inter', sans-serif !important;
    background-color: var(--bg) !important;
    color: var(--text) !important;
}

.stApp {
    background: radial-gradient(circle at 50% 0%, #160d32 0%, var(--bg) 80%) !important;
}

/* Animated grid background */
.stApp::before {
    content: '';
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background-image:
        linear-gradient(rgba(124, 58, 237, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(124, 58, 237, 0.02) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
}

/* ── Sidebar ── */
[data-testid="stSidebar"] {
    background-color: #06060c !important;
    border-right: 1px solid var(--border) !important;
}

[data-testid="stSidebar"] * {
    color: var(--text) !important;
}

/* ── Headings ── */
h1, h2, h3, h4, h5, h6 {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 700 !important;
    color: var(--text) !important;
}

/* ── Hero Title ── */
.hero-title {
    font-family: 'Outfit', sans-serif;
    font-size: clamp(2rem, 5vw, 3.2rem);
    font-weight: 800;
    line-height: 1.1;
    margin: 0;
    background: linear-gradient(135deg, #ffffff 0%, #a78bfa 50%, var(--accent-2) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 0 40px rgba(124, 58, 237, 0.15);
}

.hero-sub {
    font-family: 'Inter', sans-serif;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-top: 0.5rem;
}

/* ── Cards ── */
.card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.5rem;
    margin-bottom: 1.25rem;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(12px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
    border-color: var(--accent);
    box-shadow: 0 8px 30px rgba(124, 58, 237, 0.15);
    transform: translateY(-2px);
}

.card::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 4px; height: 100%;
    background: linear-gradient(180deg, var(--accent), var(--accent-2));
}

.card-title {
    font-family: 'Outfit', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.card-content {
    font-family: 'Inter', sans-serif;
    font-size: 0.95rem;
    line-height: 1.7;
    color: var(--text);
}

.card-content ul, .card-content ol {
    margin-left: 1.2rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

.card-content li {
    margin-bottom: 0.4rem;
}

/* ── Metric Cards ── */
.metric-card {
    background: rgba(13, 13, 23, 0.45);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.2rem;
    text-align: center;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
}

.metric-card:hover {
    border-color: var(--accent-2);
    box-shadow: 0 4px 15px rgba(6, 182, 212, 0.1);
}

.metric-value {
    font-family: 'Outfit', sans-serif;
    font-size: 1.4rem;
    font-weight: 700;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.metric-label {
    font-family: 'Inter', sans-serif;
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 0.3rem;
}

/* ── Accent Badge ── */
.badge {
    display: inline-block;
    padding: 0.3rem 0.75rem;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.badge-purple { background: rgba(124,58,237,0.15); color: #c084fc; border: 1px solid rgba(124,58,237,0.3); }
.badge-cyan   { background: rgba(6,182,212,0.12); color: #22d3ee;    border: 1px solid rgba(6,182,212,0.25); }
.badge-green  { background: rgba(16,185,129,0.12); color: #34d399;    border: 1px solid rgba(16,185,129,0.25); }

/* ── Input & Buttons ── */
.stTextInput > div > div > input,
.stSelectbox > div > div {
    background: var(--surface-2) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    color: var(--text) !important;
    font-family: 'Inter', sans-serif !important;
    transition: all 0.3s ease !important;
}

.stTextInput > div > div > input:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 2px rgba(124,58,237,0.25) !important;
}

.stButton > button {
    background: linear-gradient(135deg, var(--accent), #5b21b6) !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 10px !important;
    font-family: 'Outfit', sans-serif !important;
    font-weight: 600 !important;
    font-size: 0.85rem !important;
    letter-spacing: 0.06em !important;
    padding: 0.6rem 1.5rem !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    text-transform: uppercase !important;
    box-shadow: 0 4px 15px rgba(124, 58, 237, 0.2) !important;
    width: 100%;
}

.stButton > button:hover {
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 25px rgba(124, 58, 237, 0.45) !important;
    border-color: var(--accent-glow) !important;
}

.stButton > button:active {
    transform: translateY(0px) !important;
}

.stButton > button[kind="secondary"] {
    background: rgba(255, 255, 255, 0.05) !important;
    color: var(--text) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: none !important;
}

.stButton > button[kind="secondary"]:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}

/* ── Tabs Overrides ── */
div[data-testid="stTabBar"] {
    background: rgba(13, 13, 23, 0.4);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.3rem;
    backdrop-filter: blur(10px);
    margin-bottom: 1.5rem;
}

button[data-baseweb="tab"] {
    background: transparent !important;
    border: none !important;
    color: var(--text-muted) !important;
    font-family: 'Outfit', sans-serif !important;
    font-weight: 600 !important;
    font-size: 0.95rem !important;
    transition: all 0.3s ease !important;
    border-radius: 8px !important;
    padding: 0.6rem 1.2rem !important;
}

button[data-baseweb="tab"]:hover {
    color: var(--text) !important;
    background: rgba(255, 255, 255, 0.04) !important;
}

button[data-baseweb="tab"][aria-selected="true"] {
    color: white !important;
    background: linear-gradient(135deg, var(--accent), #5b21b6) !important;
    box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3) !important;
}

div[data-baseweb="tab-highlight-line"] {
    background-color: transparent !important;
}

/* ── Timeline ── */
.timeline-container {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-left: 0.3rem;
    margin-top: 1rem;
}

.timeline-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    position: relative;
    padding-bottom: 0.6rem;
}

.timeline-item:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 9px;
    top: 20px;
    bottom: -5px;
    width: 2px;
    background: var(--border);
    z-index: 1;
}

.timeline-badge {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    z-index: 2;
    background: #0f0f18;
    border: 2px solid var(--border);
    transition: all 0.3s ease;
    color: var(--text-muted);
}

.timeline-item.active .timeline-badge {
    background: var(--accent);
    border-color: var(--accent-glow-strong);
    box-shadow: 0 0 10px var(--accent-glow-strong);
    color: white;
    animation: timeline-pulse 1.5s infinite;
}

.timeline-item.done .timeline-badge {
    background: var(--success);
    border-color: var(--success);
    color: white;
}

.timeline-content {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
    transition: color 0.3s ease;
}

.timeline-item.active .timeline-content {
    color: white;
    font-weight: 600;
}

.timeline-item.done .timeline-content {
    color: var(--text);
}

@keyframes timeline-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 8px var(--accent-glow); }
    50%       { transform: scale(1.1); box-shadow: 0 0 15px var(--accent-glow-strong); }
}

/* ── Transcript Box ── */
.transcript-box {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    line-height: 1.8;
    max-height: 450px;
    overflow-y: auto;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
    margin-bottom: 1rem;
}

/* ── Chat Messages ── */
[data-testid="stChatMessage"] {
    background: rgba(13, 13, 23, 0.45) !important;
    border: 1px solid var(--border) !important;
    border-radius: 14px !important;
    padding: 1rem !important;
    margin-bottom: 0.75rem !important;
    backdrop-filter: blur(10px);
}

[data-testid="stChatMessage"]:hover {
    border-color: var(--border-hover) !important;
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.08);
}

[data-testid="stChatMessage"][data-test-role="user"] {
    background: rgba(124, 58, 237, 0.08) !important;
    border: 1px solid rgba(124, 58, 237, 0.22) !important;
}

[data-testid="stChatMessage"] p {
    color: var(--text) !important;
    font-size: 0.92rem;
    line-height: 1.6;
}

[data-testid="stChatInput"] {
    background: transparent !important;
    border: none !important;
}

[data-testid="stChatInput"] textarea {
    background-color: rgba(13, 13, 23, 0.8) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    color: var(--text) !important;
    font-family: 'Inter', sans-serif !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
}

[data-testid="stChatInput"] textarea:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.25) !important;
}

/* ── Stale Elements ── */
.stProgress > div > div > div { background: var(--accent) !important; }
.stSpinner > div { border-top-color: var(--accent) !important; }
[data-testid="stMarkdownContainer"] p { color: var(--text) !important; }
label { color: var(--text-muted) !important; font-size: 0.8rem !important; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }
</style>
""", unsafe_allow_html=True)

# ─── Session State Init ──────────────────────────────────────────────────────────
for key, default in {
    "result": None,
    "chat_history": [],
    "processing": False,
    "pipeline_done": False,
    "pipeline_steps": {},
    "source_type": "YouTube URL",
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

# ─── Helpers ────────────────────────────────────────────────────────────────────
def draw_timeline(placeholder, steps: dict):
    steps_definition = [
        ("audio",      "🔊", "Audio Processing"),
        ("transcript", "📝", "Transcription"),
        ("title",      "🏷️", "Title Generation"),
        ("summary",    "📋", "Summarisation"),
        ("extract",    "🔍", "Extraction"),
        ("rag",        "🧠", "RAG Engine"),
    ]
    
    html = '<div class="timeline-container">'
    for key, icon, label in steps_definition:
        status = steps.get(key, "pending")
        if status == "active":
            cls = "active"
            badge = "●"
        elif status == "done":
            cls = "done"
            badge = "✓"
        else:
            cls = "pending"
            badge = "○"
            
        html += f"""
        <div class="timeline-item {cls}">
            <div class="timeline-badge">{badge}</div>
            <div class="timeline-content">{icon} {label}</div>
        </div>"""
    html += '</div>'
    placeholder.markdown(html, unsafe_allow_html=True)

# ─── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown('<div class="hero-title" style="font-size:1.8rem">🎬 Transcriva</div>', unsafe_allow_html=True)
    st.markdown('<div class="hero-sub" style="font-size:0.75rem; letter-spacing:0.1em;">Meeting Intelligence</div>', unsafe_allow_html=True)
    st.markdown("---")

    st.markdown('<span class="badge badge-purple">Input Source</span>', unsafe_allow_html=True)
    
    input_method = st.radio(
        "Select input source",
        ["YouTube URL", "Upload Audio/Video", "Local File Path"],
        label_visibility="collapsed"
    )
    
    source = ""
    uploaded_filename = None
    
    if input_method == "YouTube URL":
        source = st.text_input(
            "YouTube Video URL",
            placeholder="https://youtube.com/watch?v=...",
            label_visibility="collapsed"
        )
    elif input_method == "Upload Audio/Video":
        uploaded_file = st.file_uploader(
            "Choose audio/video file",
            type=["mp3", "wav", "m4a", "mp4"],
            label_visibility="collapsed"
        )
        if uploaded_file is not None:
            os.makedirs("downloads", exist_ok=True)
            temp_path = os.path.join("downloads", uploaded_file.name)
            with open(temp_path, "wb") as f:
                f.write(uploaded_file.getbuffer())
            source = temp_path
            uploaded_filename = uploaded_file.name
            st.success(f"Uploaded: {uploaded_file.name}")
    else:
        source = st.text_input(
            "Local file path",
            placeholder="C:\\path\\to\\file.mp3",
            label_visibility="collapsed"
        )

    language = st.selectbox("Language", ["english", "hinglish"], index=0)

    whisper_model = "small"
    if language == "english":
        whisper_model = st.selectbox(
            "Whisper Model Size",
            ["tiny", "base", "small", "medium"],
            index=2,
            format_func=lambda x: {
                "tiny": "🚀 Tiny (Fastest)",
                "base": "⚡ Base (Fast)",
                "small": "⚖️ Small (Balanced)",
                "medium": "🎯 Medium (Accurate)"
            }[x],
            help="Choose Tiny or Base for much faster transcription on CPU."
        )

    with st.expander("🔑 API Keys", expanded=False):
        user_mistral_key = st.text_input(
            "Mistral API Key",
            value=os.getenv("MISTRAL_API_KEY", ""),
            type="password",
            help="Required for RAG Chat and Summarization."
        )
        user_sarvam_key = st.text_input(
            "Sarvam API Key",
            value=os.getenv("SARVAM_API_KEY", ""),
            type="password",
            help="Required for Hinglish transcription."
        )
        if user_mistral_key:
            os.environ["MISTRAL_API_KEY"] = user_mistral_key
        if user_sarvam_key:
            os.environ["SARVAM_API_KEY"] = user_sarvam_key

    # Warnings for missing keys
    if language == "hinglish" and not os.getenv("SARVAM_API_KEY"):
        st.warning("⚠️ Sarvam API Key is required for Hinglish. Enter it in '🔑 API Keys' above.")
    if not os.getenv("MISTRAL_API_KEY"):
        st.warning("⚠️ Mistral API Key is required for Chat/Summary. Enter it in '🔑 API Keys' above.")

    with st.expander("YouTube Advanced Access", expanded=False):
        youtube_cookies_file = st.text_input(
            "Cookies file path",
            placeholder=r"C:\path\to\cookies.txt",
        )
        youtube_cookies_browser = st.selectbox(
            "Browser cookies",
            ["", "chrome", "edge", "firefox", "brave"],
            format_func=lambda value: "None" if not value else value.title(),
        )
        
    st.markdown("<div style='margin-top: 1rem;'></div>", unsafe_allow_html=True)
    run_btn = st.button("⚡ Analyse", use_container_width=True)

    # Always render the timeline container in the sidebar
    st.markdown("---")
    st.markdown('<span class="badge badge-cyan">Pipeline Status</span>', unsafe_allow_html=True)
    timeline_placeholder = st.empty()
    draw_timeline(timeline_placeholder, st.session_state.pipeline_steps)

# ─── Main Area ──────────────────────────────────────────────────────────────────
st.markdown('<div class="hero-title">Transcriva AI</div>', unsafe_allow_html=True)
st.markdown('<div class="hero-sub">Transcribe · Summarise · Chat with your meetings</div>', unsafe_allow_html=True)
st.markdown("---")

# ── Run Pipeline ────────────────────────────────────────────────────────────────
if run_btn:
    if not source.strip():
        st.error("Please provide a valid input source (YouTube URL, file upload, or local path).")
    else:
        st.session_state.pipeline_done = False
        st.session_state.result = None
        st.session_state.chat_history = []
        st.session_state.pipeline_steps = {}
        st.session_state.source_type = input_method

        progress_placeholder = st.empty()

        def update_step(key, state):
            st.session_state.pipeline_steps[key] = state
            draw_timeline(timeline_placeholder, st.session_state.pipeline_steps)

        try:
            with progress_placeholder.container():
                st.info("⚙️ Processing pipeline is running... See sidebar for real-time logs.")

            update_step("audio", "active")
            chunks = process_input(
                source,
                youtube_cookies_file=youtube_cookies_file,
                youtube_cookies_browser=youtube_cookies_browser,
            )
            update_step("audio", "done")

            update_step("transcript", "active")
            transcript = transcribe_all(chunks, language, whisper_model=whisper_model)
            update_step("transcript", "done")

            update_step("title", "active")
            title = generate_title(transcript)
            update_step("title", "done")

            update_step("summary", "active")
            summary = summarize(transcript)
            update_step("summary", "done")

            update_step("extract", "active")
            action_items  = extract_action_items(transcript)
            decisions     = extract_key_decisions(transcript)
            questions     = extract_questions(transcript)
            update_step("extract", "done")

            update_step("rag", "active")
            rag_chain = build_rag_chain(transcript)
            update_step("rag", "done")

            st.session_state.result = {
                "title": title,
                "transcript": transcript,
                "summary": summary,
                "action_items": action_items,
                "key_decisions": decisions,
                "open_questions": questions,
                "rag_chain": rag_chain,
                "source_path": source,
                "uploaded_filename": uploaded_filename
            }
            st.session_state.pipeline_done = True
            progress_placeholder.success("✅ Analysis complete!")
            time.sleep(0.5)
            progress_placeholder.empty()
            st.rerun()

        except Exception as e:
            for k in ["audio","transcript","title","summary","extract","rag"]:
                if st.session_state.pipeline_steps.get(k) == "active":
                    st.session_state.pipeline_steps[k] = "pending"
            draw_timeline(timeline_placeholder, st.session_state.pipeline_steps)
            progress_placeholder.error(f"❌ Pipeline Error: {e}")

# ── Results ──────────────────────────────────────────────────────────────────────
if st.session_state.result:
    r = st.session_state.result

    # Title Card
    st.markdown(f"""
    <div class="card">
        <div class="card-title">📌 Session Title</div>
        <div style="font-family:'Outfit',sans-serif;font-size:1.5rem;font-weight:700;color:white">
            {r['title']}
        </div>
    </div>""", unsafe_allow_html=True)

    # Tabs navigation
    tab_overview, tab_insights, tab_transcript, tab_chat = st.tabs([
        "📊 Overview", 
        "🎯 Key Insights", 
        "📝 Full Transcript", 
        "💬 Chat Assistant"
    ])

    # ── Tab: Overview ──
    with tab_overview:
        col_m1, col_m2, col_m3 = st.columns(3)
        with col_m1:
            src_val = st.session_state.source_type
            if src_val == "Upload Audio/Video" and r.get("uploaded_filename"):
                src_val = r["uploaded_filename"]
            st.markdown(f"""
            <div class="metric-card">
                <div class="metric-value">{src_val}</div>
                <div class="metric-label">Source</div>
            </div>""", unsafe_allow_html=True)
        with col_m2:
            st.markdown(f"""
            <div class="metric-card">
                <div class="metric-value">{language.title()}</div>
                <div class="metric-label">Language</div>
            </div>""", unsafe_allow_html=True)
        with col_m3:
            st.markdown(f"""
            <div class="metric-card">
                <div class="metric-value">✅ Complete</div>
                <div class="metric-label">Status</div>
            </div>""", unsafe_allow_html=True)

        st.markdown("<div style='margin-top: 1.5rem;'></div>", unsafe_allow_html=True)

        # Split Summary and Media Player
        col_summary, col_media = st.columns([5, 4], gap="large")
        
        with col_summary:
            st.markdown("### 📋 Executive Summary")
            st.markdown(f"""
            <div class="card">
                <div class="card-content">{r['summary']}</div>
            </div>""", unsafe_allow_html=True)
            
        with col_media:
            st.markdown("### 📺 Media Reference")
            src_path = r.get("source_path", "")
            if src_path.startswith("http://") or src_path.startswith("https://"):
                st.video(src_path)
            elif os.path.exists(src_path):
                # Check extension to render video or audio
                ext = os.path.splitext(src_path)[1].lower()
                if ext in [".mp4"]:
                    st.video(src_path)
                else:
                    st.audio(src_path)
            else:
                st.info("Source file is no longer available for preview.")

    # ── Tab: Key Insights ──
    with tab_insights:
        col_i1, col_i2 = st.columns(2, gap="medium")
        
        with col_i1:
            st.markdown(f"""
            <div class="card">
                <div class="card-title">✅ Action Items</div>
                <div class="card-content">{r['action_items']}</div>
            </div>""", unsafe_allow_html=True)
            
        with col_i2:
            st.markdown(f"""
            <div class="card">
                <div class="card-title">🔑 Key Decisions</div>
                <div class="card-content">{r['key_decisions']}</div>
            </div>""", unsafe_allow_html=True)

        st.markdown(f"""
        <div class="card">
            <div class="card-title">❓ Open Questions</div>
            <div class="card-content">{r['open_questions']}</div>
        </div>""", unsafe_allow_html=True)

    # ── Tab: Full Transcript ──
    with tab_transcript:
        st.markdown("### 📝 Full Transcript")
        st.markdown(f'<div class="transcript-box">{r["transcript"]}</div>', unsafe_allow_html=True)
        
        # Download Transcript Button
        st.download_button(
            label="📥 Download Transcript as TXT",
            data=r["transcript"],
            file_name=f"{r['title'].replace(' ', '_')}_transcript.txt",
            mime="text/plain",
        )

    # ── Tab: Chat Assistant ──
    with tab_chat:
        st.markdown("### 💬 Chat with your Meeting")
        st.markdown("Ask specific details, clarify statements, or query numbers directly from the transcript using natural language.")
        st.markdown("---")

        # Display history
        for msg in st.session_state.chat_history:
            avatar = "👤" if msg["role"] == "user" else "🤖"
            with st.chat_message(msg["role"], avatar=avatar):
                st.markdown(msg["content"])

        # React to user input
        if prompt := st.chat_input("Ask something about the meeting..."):
            # Display user message
            with st.chat_message("user", avatar="👤"):
                st.markdown(prompt)
            st.session_state.chat_history.append({"role": "user", "content": prompt})

            # Fetch answer
            with st.spinner("Thinking..."):
                answer = ask_question(r["rag_chain"], prompt)
            
            with st.chat_message("assistant", avatar="🤖"):
                st.markdown(answer)
            st.session_state.chat_history.append({"role": "assistant", "content": answer})
            st.rerun()

        # Clear button below
        if st.session_state.chat_history:
            st.markdown("<div style='margin-top: 1rem;'></div>", unsafe_allow_html=True)
            if st.button("🗑️ Clear Chat History", key="clear_chat_history_button"):
                st.session_state.chat_history = []
                st.rerun()

else:
    # Empty State Hero Landing Page
    st.markdown("""
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5rem 2rem;text-align:center;background:radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%);border-radius:20px;border:1px solid rgba(124,58,237,0.1);margin-top:1.5rem;">
        <div style="font-size:4.5rem;margin-bottom:1rem;filter: drop-shadow(0 0 25px rgba(124,58,237,0.3));">🎬</div>
        <div class="hero-title" style="font-size:2.8rem;">Ready to Transcribe</div>
        <div style="color:var(--text-muted);font-size:0.95rem;max-width:440px;line-height:1.7;margin-top:0.5rem;margin-bottom:2rem;">
            Provide a YouTube video link, drag and drop an audio/video file, or specify a path in the sidebar. We'll handle transcription, summarization, and let you chat with the contents.
        </div>
        <div style="display:flex;gap:0.8rem;flex-wrap:wrap;justify-content:center">
            <span class="badge badge-purple">🔊 Transcription</span>
            <span class="badge badge-cyan">📋 Summarisation</span>
            <span class="badge badge-green">🧠 RAG Chat</span>
        </div>
    </div>""", unsafe_allow_html=True)
