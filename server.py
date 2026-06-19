import os
import json
import uuid
import secrets
import hashlib
import hmac
import threading
import traceback
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from utils.audio_processor import process_input
from core.transcriber import transcribe_all
from core.summarizer import summarize, generate_title
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.rag_engine import build_rag_chain, ask_question

# Load initial dotenv keys
load_dotenv()

app = FastAPI()

# Enable CORS for React development server
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Password Hashing (stdlib SHA-256 + salt, no extra deps) ───────────────────
def _hash_password(password: str) -> str:
    """Return 'salt:digest' using HMAC-SHA256."""
    salt = secrets.token_hex(16)
    digest = hmac.new(salt.encode(), password.encode(), hashlib.sha256).hexdigest()
    return f"{salt}:{digest}"

def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split(":", 1)
        expected = hmac.new(salt.encode(), password.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, digest)
    except Exception:
        return False

# ─── File-backed stores ────────────────────────────────────────────────────────
USERS_FILE = "users_db.json"
TASKS_FILE = "tasks_db.json"

# In-memory token → username map (clears on restart, which is fine)
active_sessions: dict[str, str] = {}  # token → username

def _load_json(path: str, default):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default

def _save_json(path: str, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _get_users() -> dict:
    return _load_json(USERS_FILE, {})

def _save_users(users: dict):
    _save_json(USERS_FILE, users)

def _get_tasks() -> list:
    return _load_json(TASKS_FILE, [])

def _save_tasks(tasks: list):
    _save_json(TASKS_FILE, tasks)

# ─── Seed demo users if not present ───────────────────────────────────────────
def _seed_users():
    users = _get_users()
    demo = [
        {"username": "ayush",   "password": "ayush123",   "display_name": "Ayush",   "avatar": "🧑‍💻", "role": "admin"},
        {"username": "alice",   "password": "alice123",   "display_name": "Alice",   "avatar": "👩‍💼", "role": "member"},
        {"username": "bob",     "password": "bob123",     "display_name": "Bob",     "avatar": "👨‍💼", "role": "member"},
        {"username": "charlie", "password": "charlie123", "display_name": "Charlie", "avatar": "🧑‍🔬", "role": "member"},
    ]
    changed = False
    for d in demo:
        if d["username"] not in users:
            users[d["username"]] = {
                "username":     d["username"],
                "display_name": d["display_name"],
                "avatar":       d["avatar"],
                "role":         d["role"],
                "password_hash": _hash_password(d["password"]),
            }
            changed = True
    if changed:
        _save_users(users)

_seed_users()

# ─── Auth helpers ──────────────────────────────────────────────────────────────
def _get_current_user(authorization: Optional[str]) -> dict:
    """Extract user from Bearer token header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    username = active_sessions.get(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    users = _get_users()
    user = users.get(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ─── Pydantic models ───────────────────────────────────────────────────────────
class LoginPayload(BaseModel):
    username: str
    password: str

class TaskCreatePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    assigned_to: str
    meeting_title: Optional[str] = ""
    due_date: Optional[str] = None
    priority: Optional[str] = "medium"   # high | medium | low

class TaskUpdatePayload(BaseModel):
    status: Optional[str] = None          # pending | in_progress | done
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None

class ChatPayload(BaseModel):
    question: str

# ─── Auth Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/auth/login")
async def login(payload: LoginPayload):
    users = _get_users()
    user = users.get(payload.username.strip().lower())
    if not user or not _verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = secrets.token_hex(32)
    active_sessions[token] = user["username"]
    return {
        "token": token,
        "user": {
            "username":     user["username"],
            "display_name": user["display_name"],
            "avatar":       user["avatar"],
            "role":         user["role"],
        }
    }

@app.post("/api/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        active_sessions.pop(token, None)
    return {"status": "logged_out"}

@app.get("/api/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    return {
        "username":     user["username"],
        "display_name": user["display_name"],
        "avatar":       user["avatar"],
        "role":         user["role"],
    }

# ─── Users Endpoint ────────────────────────────────────────────────────────────
@app.get("/api/users")
async def list_users(authorization: Optional[str] = Header(None)):
    _get_current_user(authorization)   # must be logged in
    users = _get_users()
    return [
        {
            "username":     u["username"],
            "display_name": u["display_name"],
            "avatar":       u["avatar"],
            "role":         u["role"],
        }
        for u in users.values()
    ]

# ─── Task Endpoints ────────────────────────────────────────────────────────────
@app.get("/api/tasks")
async def get_tasks(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    tasks = _get_tasks()
    # Admin sees all tasks; members only see tasks assigned to them
    if user["role"] == "admin":
        return tasks
    return [t for t in tasks if t["assigned_to"] == user["username"]]

@app.post("/api/tasks")
async def create_task(payload: TaskCreatePayload, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    # Validate assignee exists
    users = _get_users()
    if payload.assigned_to not in users:
        raise HTTPException(status_code=400, detail=f"User '{payload.assigned_to}' not found")
    task = {
        "id":            str(uuid.uuid4()),
        "title":         payload.title,
        "description":   payload.description or "",
        "assigned_to":   payload.assigned_to,
        "assigned_by":   user["username"],
        "meeting_title": payload.meeting_title or "",
        "due_date":      payload.due_date,
        "priority":      payload.priority or "medium",
        "status":        "pending",
        "created_at":    datetime.utcnow().isoformat(),
    }
    tasks = _get_tasks()
    tasks.append(task)
    _save_tasks(tasks)
    return task

@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdatePayload, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    tasks = _get_tasks()
    for t in tasks:
        if t["id"] == task_id:
            # Only assignee or admin can update
            if t["assigned_to"] != user["username"] and user["role"] != "admin":
                raise HTTPException(status_code=403, detail="Not authorised to update this task")
            if payload.status is not None:
                t["status"] = payload.status
            if payload.title is not None:
                t["title"] = payload.title
            if payload.description is not None:
                t["description"] = payload.description
            if payload.priority is not None:
                t["priority"] = payload.priority
            if payload.due_date is not None:
                t["due_date"] = payload.due_date
            t["updated_at"] = datetime.utcnow().isoformat()
            _save_tasks(tasks)
            return t
    raise HTTPException(status_code=404, detail="Task not found")

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    tasks = _get_tasks()
    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            if t["assigned_by"] != user["username"] and user["role"] != "admin":
                raise HTTPException(status_code=403, detail="Not authorised to delete this task")
            tasks.pop(i)
            _save_tasks(tasks)
            return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Task not found")

# ─── Global Analysis State ─────────────────────────────────────────────────────
global_state = {
    "status": "idle",
    "error": None,
    "steps": {
        "audio": "pending",
        "transcript": "pending",
        "title": "pending",
        "summary": "pending",
        "extract": "pending",
        "rag": "pending",
    },
    "result": None,
    "chat_history": [],
    "rag_chain": None,
    "source_type": "YouTube URL",
}

state_lock = threading.Lock()

def run_pipeline_thread(
    source: str,
    language: str,
    whisper_model: str,
    youtube_cookies_file: str | None,
    youtube_cookies_browser: str | None,
    source_type: str,
):
    global global_state

    def update_step(key, state):
        with state_lock:
            global_state["steps"][key] = state

    try:
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
        action_items = extract_action_items(transcript)
        decisions = extract_key_decisions(transcript)
        questions = extract_questions(transcript)
        update_step("extract", "done")

        update_step("rag", "active")
        rag_chain = build_rag_chain(transcript)
        update_step("rag", "done")

        with state_lock:
            global_state["result"] = {
                "title": title,
                "transcript": transcript,
                "summary": summary,
                "action_items": action_items,
                "key_decisions": decisions,
                "open_questions": questions,
                "source_path": source,
                "source_type": source_type,
            }
            global_state["rag_chain"] = rag_chain
            global_state["status"] = "completed"

    except Exception as e:
        traceback.print_exc()
        with state_lock:
            global_state["status"] = "failed"
            global_state["error"] = str(e)
            for k, v in global_state["steps"].items():
                if v == "active":
                    global_state["steps"][k] = "pending"

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        os.makedirs("downloads", exist_ok=True)
        filename = os.path.basename(file.filename)
        temp_path = os.path.join("downloads", filename)
        with open(temp_path, "wb") as f:
            f.write(await file.read())
        return {"filepath": temp_path, "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@app.post("/api/analyze")
async def analyze(
    source: str = Form(...),
    language: str = Form("english"),
    whisper_model: str = Form("small"),
    source_type: str = Form("YouTube URL"),
    youtube_cookies_file: str | None = Form(None),
    youtube_cookies_browser: str | None = Form(None),
    user_mistral_key: str | None = Form(None),
    user_sarvam_key: str | None = Form(None),
):
    global global_state

    with state_lock:
        if global_state["status"] == "running":
            raise HTTPException(status_code=400, detail="An analysis is already running.")
        global_state["status"] = "running"
        global_state["error"] = None
        global_state["result"] = None
        global_state["rag_chain"] = None
        global_state["chat_history"] = []
        global_state["source_type"] = source_type
        for k in global_state["steps"]:
            global_state["steps"][k] = "pending"

    if user_mistral_key:
        os.environ["MISTRAL_API_KEY"] = user_mistral_key.strip()
    if user_sarvam_key:
        os.environ["SARVAM_API_KEY"] = user_sarvam_key.strip()

    if not source.strip():
        with state_lock:
            global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Please provide a valid input source.")

    if language == "hinglish" and not os.environ.get("SARVAM_API_KEY"):
        with state_lock:
            global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Sarvam API Key is required for Hinglish.")

    if not os.environ.get("MISTRAL_API_KEY"):
        with state_lock:
            global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Mistral API Key is required for Summarization/Chat.")

    cookies_file = youtube_cookies_file.strip() if youtube_cookies_file and youtube_cookies_file.strip() else None
    cookies_browser = youtube_cookies_browser.strip() if youtube_cookies_browser and youtube_cookies_browser.strip() else None

    thread = threading.Thread(
        target=run_pipeline_thread,
        args=(source.strip(), language, whisper_model, cookies_file, cookies_browser, source_type)
    )
    thread.daemon = True
    thread.start()
    return {"status": "started"}

@app.get("/api/status")
async def get_status():
    with state_lock:
        return {
            "status": global_state["status"],
            "error": global_state["error"],
            "steps": global_state["steps"],
            "result": global_state["result"],
            "chat_history": global_state["chat_history"],
            "mistral_configured": bool(os.environ.get("MISTRAL_API_KEY")),
            "sarvam_configured": bool(os.environ.get("SARVAM_API_KEY")),
        }

@app.post("/api/chat")
async def chat(payload: ChatPayload):
    global global_state
    if not global_state["rag_chain"]:
        raise HTTPException(status_code=400, detail="RAG chain not initialized. Build the model first.")
    try:
        answer = ask_question(global_state["rag_chain"], payload.question)
        with state_lock:
            global_state["chat_history"].append({"role": "user", "content": payload.question})
            global_state["chat_history"].append({"role": "assistant", "content": answer})
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG Chat failed: {str(e)}")

@app.post("/api/clear-chat")
async def clear_chat():
    with state_lock:
        global_state["chat_history"] = []
    return {"status": "cleared"}

# Serve main index file
@app.get("/")
async def serve_index():
    dist_index = os.path.join("frontend", "dist", "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return HTMLResponse("<h1>Frontend build not found!</h1>", status_code=404)

@app.get("/api/media")
async def serve_media(path: str):
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Media file not found")

dist_assets = os.path.join("frontend", "dist", "assets")
if os.path.exists(dist_assets):
    app.mount("/assets", StaticFiles(directory=dist_assets), name="assets")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)


from utils.audio_processor import process_input
from core.transcriber import transcribe_all
from core.summarizer import summarize, generate_title
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.rag_engine import build_rag_chain, ask_question

# Load initial dotenv keys
load_dotenv()

app = FastAPI()

# Enable CORS for React development server
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State
global_state = {
    "status": "idle",       # idle, running, completed, failed
    "error": None,
    "steps": {
        "audio": "pending",      # pending, active, done
        "transcript": "pending",
        "title": "pending",
        "summary": "pending",
        "extract": "pending",
        "rag": "pending",
    },
    "result": None,
    "chat_history": [],
    "rag_chain": None,
    "source_type": "YouTube URL",
}

# Lock for modifying state and background thread
state_lock = threading.Lock()

class ChatPayload(BaseModel):
    question: str

def run_pipeline_thread(
    source: str,
    language: str,
    whisper_model: str,
    youtube_cookies_file: str | None,
    youtube_cookies_browser: str | None,
    source_type: str,
):
    global global_state
    
    def update_step(key, state):
        with state_lock:
            global_state["steps"][key] = state


    try:
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
        action_items = extract_action_items(transcript)
        decisions = extract_key_decisions(transcript)
        questions = extract_questions(transcript)
        update_step("extract", "done")

        update_step("rag", "active")
        rag_chain = build_rag_chain(transcript)
        update_step("rag", "done")

        with state_lock:
            global_state["result"] = {
                "title": title,
                "transcript": transcript,
                "summary": summary,
                "action_items": action_items,
                "key_decisions": decisions,
                "open_questions": questions,
                "source_path": source,
                "source_type": source_type,
            }
            global_state["rag_chain"] = rag_chain
            global_state["status"] = "completed"
            
    except Exception as e:
        traceback.print_exc()
        with state_lock:
            global_state["status"] = "failed"
            global_state["error"] = str(e)
            # Mark active steps as pending to reset layout on UI
            for k, v in global_state["steps"].items():
                if v == "active":
                    global_state["steps"][k] = "pending"

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        os.makedirs("downloads", exist_ok=True)
        # Preserve original filename, but handle empty inputs or paths safely
        filename = os.path.basename(file.filename)
        temp_path = os.path.join("downloads", filename)
        with open(temp_path, "wb") as f:
            f.write(await file.read())
        return {"filepath": temp_path, "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@app.post("/api/analyze")
async def analyze(
    source: str = Form(...),
    language: str = Form("english"),
    whisper_model: str = Form("small"),
    source_type: str = Form("YouTube URL"),
   
    youtube_cookies_file: str | None = Form(None),
    youtube_cookies_browser: str | None = Form(None),
    user_mistral_key: str | None = Form(None),
    user_sarvam_key: str | None = Form(None),
):
    global global_state
    
    with state_lock:
        if global_state["status"] == "running":
            raise HTTPException(status_code=400, detail="An analysis is already running.")
        
        # Reset state
        global_state["status"] = "running"
        global_state["error"] = None
        global_state["result"] = None
        global_state["rag_chain"] = None
        global_state["chat_history"] = []
        global_state["source_type"] = source_type

        for k in global_state["steps"]:
            global_state["steps"][k] = "pending"

    # Inject keys into environment variables if provided
    if user_mistral_key:
        os.environ["MISTRAL_API_KEY"] = user_mistral_key.strip()
    if user_sarvam_key:
        os.environ["SARVAM_API_KEY"] = user_sarvam_key.strip()

    # Input validations
    if not source.strip():
        with state_lock:
            global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Please provide a valid input source.")

    if language == "hinglish" and not os.environ.get("SARVAM_API_KEY"):
        with state_lock:
            global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Sarvam API Key is required for Hinglish. Enter it in API Keys section.")

    if not os.environ.get("MISTRAL_API_KEY"):
        with state_lock:
            global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Mistral API Key is required for Summarization/Chat.")

    # Clean up empty strings to None
    cookies_file = youtube_cookies_file.strip() if youtube_cookies_file and youtube_cookies_file.strip() else None
    cookies_browser = youtube_cookies_browser.strip() if youtube_cookies_browser and youtube_cookies_browser.strip() else None

    # Spawn thread to run pipeline background
    thread = threading.Thread(
        target=run_pipeline_thread,
        args=(
            source.strip(),
            language,
            whisper_model,
            cookies_file,
            cookies_browser,
            source_type,
        )
    )
    thread.daemon = True
    thread.start()

    return {"status": "started"}

@app.get("/api/status")
async def get_status():
    with state_lock:
        return {
            "status": global_state["status"],
            "error": global_state["error"],
            "steps": global_state["steps"],
            "result": global_state["result"],
            "chat_history": global_state["chat_history"],
            "mistral_configured": bool(os.environ.get("MISTRAL_API_KEY")),
            "sarvam_configured": bool(os.environ.get("SARVAM_API_KEY")),
        }

@app.post("/api/chat")
async def chat(payload: ChatPayload):
    global global_state
    
    if not global_state["rag_chain"]:
        raise HTTPException(status_code=400, detail="RAG chain not initialized. Build the model first.")
        
    try:
        answer = ask_question(global_state["rag_chain"], payload.question)
        with state_lock:
            global_state["chat_history"].append({"role": "user", "content": payload.question})
            global_state["chat_history"].append({"role": "assistant", "content": answer})
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG Chat failed: {str(e)}")

@app.post("/api/clear-chat")
async def clear_chat():
    with state_lock:
        global_state["chat_history"] = []
    return {"status": "cleared"}

# Serve main index file
@app.get("/")
async def serve_index():
    # Serve React production build
    dist_index = os.path.join("frontend", "dist", "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
        
    return HTMLResponse("<h1>Frontend build not found!</h1>", status_code=404)

# Serve video or audio files from downloads directory
@app.get("/api/media")
async def serve_media(path: str):
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Media file not found")

# Serve other static files (assets from Vite production build)
dist_assets = os.path.join("frontend", "dist", "assets")
if os.path.exists(dist_assets):
    app.mount("/assets", StaticFiles(directory=dist_assets), name="assets")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
