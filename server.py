import os
import threading
import traceback
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
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
        
    # Fallback to static directory
    static_index = os.path.join("static", "index.html")
    if os.path.exists(static_index):
        return FileResponse(static_index)
        
    return HTMLResponse("<h1>Frontend build or static folder not found!</h1>", status_code=404)

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

# Serve fallback legacy static files (style.css, main.js, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
