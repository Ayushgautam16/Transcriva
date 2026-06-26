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
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

from utils.audio_processor import process_input
from core.transcriber import transcribe_all
from core.summarizer import summarize, generate_title
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.rag_engine import build_rag_chain, ask_question

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── SQLAlchemy-backed task management database ───────────────────────────────
DATABASE_URL = "sqlite:///./tasks.db"
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DBUser(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    tasks = relationship("DBTask", back_populates="user")

class DBTask(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    priority = Column(String, default="Medium")
    status = Column(String, default="To Do")
    due_date = Column(String)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    user = relationship("DBUser", back_populates="tasks")

Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
TASKS_FILE = "tasks_db.json"
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

def _get_tasks() -> list:
    return _load_json(TASKS_FILE, [])

def _save_tasks(tasks: list):
    _save_json(TASKS_FILE, tasks)

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

class TaskCreatePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    assigned_to: str
    meeting_title: Optional[str] = ""
    due_date: Optional[str] = None
    priority: Optional[str] = "medium"

class TaskUpdatePayload(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None

class ChatPayload(BaseModel):
    question: str

class DBUserCreate(BaseModel):
    name: str

class DBUserResponse(BaseModel):
    id: int
    name: str

    class Config:
        orm_mode = True

class DBTaskCreate(BaseModel):
    title: str
    description: str
    priority: str
    due_date: str

class DBAssignTask(BaseModel):
    user_id: int

class DBTaskUpdate(BaseModel):
    title: str
    description: str
    priority: str
    status: str
    due_date: str

class DBTaskResponse(BaseModel):
    id: int
    title: str
    description: str
    priority: str
    status: str
    due_date: str
    assigned_user_id: int | None = None

    class Config:
        orm_mode = True

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

# ─── Task endpoints ───────────────────────────────────────────────────────────
def _parse_task_id(task_id: str) -> int:
    try:
        return int(task_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Task not found")

@app.get("/api/tasks")
async def get_tasks(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    with SessionLocal() as db:
        tasks = db.query(DBTask).all()
    task_dicts = [_task_to_dict(t) for t in tasks]
    if user["role"] == "admin":
        return task_dicts
    return [t for t in task_dicts if t["assigned_to"] == user["username"]]

@app.post("/api/tasks")
async def create_task(payload: TaskCreatePayload, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    users = _get_users()
    if payload.assigned_to not in users:
        raise HTTPException(status_code=400, detail=f"User '{payload.assigned_to}' not found")
    task = DBTask(
        title=payload.title,
        
        description=payload.description or "",
        assigned_to=payload.assigned_to,
        assigned_by=user["username"],
        meeting_title=payload.meeting_title or "",
        due_date=payload.due_date,
        priority=payload.priority or "medium",
        status="pending",

        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat(),
    )
    with SessionLocal() as db:
        db.add(task)
        db.commit()
        db.refresh(task)
        return _task_to_dict(task)

@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdatePayload, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    task_db_id = _parse_task_id(task_id)
    with SessionLocal() as db:
        task = db.query(DBTask).filter(DBTask.id == task_db_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task.assigned_to != user["username"] and user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Not authorised")
        if payload.status is not None:
            task.status = payload.status
        if payload.title is not None:
            task.title = payload.title
        if payload.description is not None:
            task.description = payload.description
        if payload.priority is not None:
            task.priority = payload.priority
        if payload.due_date is not None:
            task.due_date = payload.due_date
        task.updated_at = datetime.utcnow().isoformat()
        db.commit()
        db.refresh(task)
        return _task_to_dict(task)

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    task_db_id = _parse_task_id(task_id)
    with SessionLocal() as db:
        task = db.query(DBTask).filter(DBTask.id == task_db_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task.assigned_by != user["username"] and user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Not authorised")
        db.delete(task)
        db.commit()
        return {"status": "deleted"}

# ─── Task dashboard & filters ─────────────────────────────────────────────────
@app.get("/api/tasks/dashboard")
async def task_dashboard(authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    with SessionLocal() as db:
        tasks = db.query(DBTask).all()
    users = _get_users()

    task_dicts = [_task_to_dict(t) for t in tasks]

    user_stats = []
    for u in users.values():
        u_tasks = [t for t in task_dicts if t["assigned_to"] == u["username"]]
        user_stats.append({
            "username":     u["username"],
            "display_name": u["display_name"],
            "avatar":       u["avatar"],
            "role":         u["role"],
            "total":        len(u_tasks),
            "pending":      sum(1 for t in u_tasks if t["status"] == "pending"),
            "in_progress":  sum(1 for t in u_tasks if t["status"] == "in_progress"),
            "done":         sum(1 for t in u_tasks if t["status"] == "done"),
        })

    return {
        "total_tasks":      len(task_dicts),
        "total_users":      len(users),
        "pending_tasks":    sum(1 for t in task_dicts if t["status"] == "pending"),
        "in_progress_tasks": sum(1 for t in task_dicts if t["status"] == "in_progress"),
        "done_tasks":       sum(1 for t in task_dicts if t["status"] == "done"),
        "high_priority":    sum(1 for t in task_dicts if t.get("priority") == "high"),
        "medium_priority":  sum(1 for t in task_dicts if t.get("priority") == "medium"),
        "low_priority":     sum(1 for t in task_dicts if t.get("priority") == "low"),
        "user_stats":       user_stats,
    }

@app.get("/api/tasks/status/{status}")
async def tasks_by_status(status: str, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    with SessionLocal() as db:
        tasks = db.query(DBTask).filter(DBTask.status == status).all()
    task_dicts = [_task_to_dict(t) for t in tasks]
    if user["role"] != "admin":
        task_dicts = [t for t in task_dicts if t["assigned_to"] == user["username"]]
    return task_dicts

@app.get("/api/tasks/priority/{priority}")
async def tasks_by_priority(priority: str, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    with SessionLocal() as db:
        tasks = db.query(DBTask).filter(DBTask.priority == priority).all()
    task_dicts = [_task_to_dict(t) for t in tasks]
    if user["role"] != "admin":
        task_dicts = [t for t in task_dicts if t["assigned_to"] == user["username"]]
    return task_dicts

class TaskReassignPayload(BaseModel):
    assigned_to: str

@app.patch("/api/tasks/{task_id}/assign")
async def reassign_task(task_id: str, payload: TaskReassignPayload, authorization: Optional[str] = Header(None)):
    user = _get_current_user(authorization)
    users = _get_users()
    if payload.assigned_to not in users:
        raise HTTPException(status_code=400, detail=f"User '{payload.assigned_to}' not found")
    task_db_id = _parse_task_id(task_id)
    with SessionLocal() as db:
        task = db.query(DBTask).filter(DBTask.id == task_db_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task.assigned_by != user["username"] and user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Not authorised to reassign")
        task.assigned_to = payload.assigned_to
        task.updated_at = datetime.utcnow().isoformat()
        db.commit()
        db.refresh(task)
        return _task_to_dict(task)

# ─── SQLAlchemy-backed task management routes ───────────────────────────────────
@app.post("/api/db/users", response_model=DBUserResponse)
def db_create_user(user: DBUserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(DBUser).filter(DBUser.name == user.name).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    new_user = DBUser(name=user.name)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.get("/api/db/users", response_model=list[DBUserResponse])
def db_get_users(db: Session = Depends(get_db)):
    return db.query(DBUser).all()

@app.post("/api/db/tasks", response_model=DBTaskResponse)
def db_create_task(task: DBTaskCreate, db: Session = Depends(get_db)):
    new_task = DBTask(
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@app.get("/api/db/tasks", response_model=list[DBTaskResponse])
def db_get_all_tasks(db: Session = Depends(get_db)):
    return db.query(DBTask).all()

@app.get("/api/db/tasks/{task_id}", response_model=DBTaskResponse)
def db_get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.patch("/api/db/tasks/{task_id}/assign")
def db_assign_task(task_id: int, data: DBAssignTask, db: Session = Depends(get_db)):
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    user = db.query(DBUser).filter(DBUser.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    task.assigned_user_id = user.id
    db.commit()
    db.refresh(task)
    return {
        "message": f"Task assigned to {user.name}",
        "task_id": task.id,
        "assigned_user_id": user.id,
    }

@app.put("/api/db/tasks/{task_id}")
def db_update_task(task_id: int, updated_task: DBTaskUpdate, db: Session = Depends(get_db)):
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.title = updated_task.title
    task.description = updated_task.description
    task.priority = updated_task.priority
    task.status = updated_task.status
    task.due_date = updated_task.due_date
    db.commit()
    db.refresh(task)
    return {"message": "Task updated successfully"}

@app.get("/api/db/users/{user_id}/tasks")
def db_get_tasks_by_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tasks = db.query(DBTask).filter(DBTask.assigned_user_id == user_id).all()
    return {
        "user": user.name,
        "tasks": tasks,
    }

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
