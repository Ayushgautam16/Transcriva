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
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


from utils.audio_processor import process_input

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ─── Password Hashing (stdlib HMAC-SHA256 + salt) ─────────────────────────────
def _hash_password(password: str) -> str:
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

# ─── File-backed stores ───────────────────────────────────────────────────────
USERS_FILE = "users_db.json"

active_sessions: dict[str, str] = {}   # token → username

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



# ─── Seed demo users ──────────────────────────────────────────────────────────
def _seed_users():
    users = _get_users()
    demo = [
        {"username": "ayush",  "password": "ayush123",  "display_name": "Ayush",  "avatar": "🧑‍💻", "role": "admin"},
        {"username": "anujha", "password": "anujha123", "display_name": "Anujha", "avatar": "👩‍💼", "role": "member"},
        {"username": "maria",  "password": "maria123",  "display_name": "Maria",  "avatar": "👩‍🔬", "role": "member"},
        {"username": "rahul",  "password": "rahul123",  "display_name": "Rahul",  "avatar": "👨‍💼", "role": "member"},
    ]
    changed = False
    for d in demo:
        if d["username"] not in users:
            users[d["username"]] = {
                "username":      d["username"],
                "display_name":  d["display_name"],
                "avatar":        d["avatar"],
                "role":          d["role"],
                "password_hash": _hash_password(d["password"]),
            }
            changed = True
    if changed:
        _save_users(users)

_seed_users()

# ─── Auth helper ──────────────────────────────────────────────────────────────
def _get_current_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    username = active_sessions.get(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = _get_users().get(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ─── Pydantic models ──────────────────────────────────────────────────────────
class LoginPayload(BaseModel):
    username: str
    password: str

class RegisterPayload(BaseModel):
    username: str
    password: str
    display_name: str
    avatar: str
    role: Optional[str] = "member"



class ChatPayload(BaseModel):
    question: str



# ─── Auth endpoints ───────────────────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(payload: RegisterPayload):
    users = _get_users()
    username = payload.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    if username in users:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    users[username] = {
        "username":      username,
        "display_name":  payload.display_name.strip() or username.capitalize(),
        "avatar":        payload.avatar or "👤",
        "role":          payload.role or "member",
        "password_hash": _hash_password(payload.password),
    }
    _save_users(users)
    
    token = secrets.token_hex(32)
    active_sessions[token] = username
    return {
        "token": token,
        "user": {
            "username":     username,
            "display_name": users[username]["display_name"],
            "avatar":       users[username]["avatar"],
            "role":         users[username]["role"],
        }
    }

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

# ─── Users endpoint ───────────────────────────────────────────────────────────
@app.get("/api/users")
async def list_users(authorization: Optional[str] = Header(None)):
    _get_current_user(authorization)
    users = _get_users()
    return [
        {"username": u["username"], "display_name": u["display_name"],
         "avatar": u["avatar"], "role": u["role"]}
        for u in users.values()
    ]



# ─── Meeting analysis state ───────────────────────────────────────────────────
global_state = {
    "status": "idle",
    "error": None,
    "steps": {
        "audio": "pending", "transcript": "pending", "title": "pending",
        "summary": "pending", "extract": "pending", "rag": "pending",
    },
    "result": None,
    "chat_history": [],
    "rag_chain": None,
    "source_type": "YouTube URL",
}
state_lock = threading.Lock()

def run_pipeline_thread(source, language, whisper_model, youtube_cookies_file, youtube_cookies_browser, source_type):
    global global_state
    from core.transcriber import transcribe_all
    from core.summarizer import summarize, generate_title
    from core.extractor import extract_action_items, extract_key_decisions, extract_questions
    from core.rag_engine import build_rag_chain

    def update_step(key, state):
        with state_lock:
            global_state["steps"][key] = state

    try:
        update_step("audio", "active")
        chunks = process_input(source, youtube_cookies_file=youtube_cookies_file, youtube_cookies_browser=youtube_cookies_browser)
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
        decisions    = extract_key_decisions(transcript)
        questions    = extract_questions(transcript)
        update_step("extract", "done")

        update_step("rag", "active")
        rag_chain = build_rag_chain(transcript)
        update_step("rag", "done")

        with state_lock:
            global_state["result"] = {
                "title": title, "transcript": transcript, "summary": summary,
                "action_items": action_items, "key_decisions": decisions,
                "open_questions": questions, "source_path": source, "source_type": source_type,
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

# ─── Existing API endpoints ───────────────────────────────────────────────────
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
        global_state.update({
            "status": "running", "error": None, "result": None,
            "rag_chain": None, "chat_history": [], "source_type": source_type,
        })
        for k in global_state["steps"]:
            global_state["steps"][k] = "pending"

    if user_mistral_key: os.environ["MISTRAL_API_KEY"] = user_mistral_key.strip()

    if user_sarvam_key:  os.environ["SARVAM_API_KEY"]  = user_sarvam_key.strip()

    if not source.strip():
        
        with state_lock: global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Please provide a valid input source.")

    if language == "hinglish" and not os.environ.get("SARVAM_API_KEY"):
        with state_lock: global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Sarvam API Key required for Hinglish.")

    if not os.environ.get("MISTRAL_API_KEY"):
        with state_lock: global_state["status"] = "idle"
        raise HTTPException(status_code=400, detail="Mistral API Key required for Summarization/Chat.")

    cookies_file    = youtube_cookies_file.strip()    if youtube_cookies_file    and youtube_cookies_file.strip()    else None
    cookies_browser = youtube_cookies_browser.strip() if youtube_cookies_browser and youtube_cookies_browser.strip() else None

    t = threading.Thread(target=run_pipeline_thread,
                         args=(source.strip(), language, whisper_model, cookies_file, cookies_browser, source_type))
    t.daemon = True
    t.start()
    return {"status": "started"}

@app.get("/api/status")
async def get_status():
    with state_lock:
        return {
            "status":             global_state["status"],
            "error":              global_state["error"],
            "steps":              global_state["steps"],
            "result":             global_state["result"],
            "chat_history":       global_state["chat_history"],
            "mistral_configured": bool(os.environ.get("MISTRAL_API_KEY")),
            "sarvam_configured":  bool(os.environ.get("SARVAM_API_KEY")),
        }

@app.post("/api/chat")
async def chat(payload: ChatPayload):
    from core.rag_engine import ask_question
    if not global_state["rag_chain"]:
        raise HTTPException(status_code=400, detail="RAG chain not initialized.")
    try:
        answer = ask_question(global_state["rag_chain"], payload.question)
        with state_lock:
            global_state["chat_history"].append({"role": "user",      "content": payload.question})
            global_state["chat_history"].append({"role": "assistant",  "content": answer})
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG Chat failed: {str(e)}")

@app.post("/api/clear-chat")
async def clear_chat():
    with state_lock:
        global_state["chat_history"] = []
    return {"status": "cleared"}

@app.get("/api/media")
async def serve_media(path: str):
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Media file not found")

# ─── Serve React frontend ─────────────────────────────────────────────────────
@app.get("/")
async def serve_index():
    dist_index = os.path.join("frontend", "dist", "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return HTMLResponse("<h1>Frontend build not found!</h1>", status_code=404)

dist_assets = os.path.join("frontend", "dist", "assets")
if os.path.exists(dist_assets):
    app.mount("/assets", StaticFiles(directory=dist_assets), name="assets")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
