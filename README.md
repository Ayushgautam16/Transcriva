# Transcriva AI 🎬

Transcriva AI is a state-of-the-art, private meeting intelligence dashboard. It processes video and audio meetings, transcribes content locally, extracts structured summaries, and provides an interactive Retrieval-Augmented Generation (RAG) chat assistant to query your meeting transcripts.

Now powered by a high-performance **FastAPI backend** and a bespoke, responsive **Vite + React frontend**, the application features an asynchronous processing pipeline, live status tracking, and a gorgeous modern UI.

![Status](https://img.shields.io/badge/Status-Active-success) ![Python](https://img.shields.io/badge/Python-3.10%2B-blue) ![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **📊 Tabbed Dashboard**: Streamlined interface containing Overview (Executive Summary & Media Player), Key Insights, Full Transcript, and Chat Assistant.
- **⚡ Asynchronous Pipeline**: Track each stage of the analysis process (Audio Processing → Transcription → Title Generation → Summarisation → Extraction → RAG Engine) in real-time via the sidebar timeline.
- **📁 Multi-Source Input**: Supports YouTube video links, local files, and direct drag-and-drop audio/video uploads
 (`.mp3, .wav, .m4a, .mp4`).
- **🚀 Whisper Speed Controls**: Choose local Whisper model sizes (`Tiny`, `Base`, `Small`, `Medium`) to speed up CPU transcription by up to 10x.
- **🌐 Bilingual Transcribe**: Full support for English (via local Whisper) and Hinglish (Hindi + English via Sarvam AI API).
- **📋 Structured Insights**: Instantly extracts Meeting Title, Executive Summary, Action Items, Key Decisions, and Open Questions.
- **💬 Chat with Meeting**: Beautifully styled RAG chat workspace using natural language queries, powered by Mistral AI, ChromaDB, and HuggingFace.
- **🔑 Secure Credentials Masking**: Manage API keys and YouTube cookies directly in the UI. Configured keys are checked dynamically and masked using placeholders (`Saved (••••••••)`) to prevent accidental leaks.

---

## 🛠️ Prerequisites

- **Python 3.10 to 3.14+**
- **FFmpeg** (installed on your system and added to your system `PATH`)

---

## 🚀 Quick Start

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Ayushgautam16/Transcriva-An-AI-Summarizer.git
   cd Transcriva-An-AI-Summarizer
   ```

2. **Install Dependencies**:
   Using `uv` (recommended):
   ```bash
   uv pip install -r Requirements.txt
   uv pip install audioop-lts langchain-chroma fastapi uvicorn python-multipart
   ```
   Or using standard `pip`:
   ```bash
   pip install -r Requirements.txt
   pip install audioop-lts langchain-chroma fastapi uvicorn python-multipart
   ```

3. **Set Up Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   MISTRAL_API_KEY=your_mistral_api_key
   SARVAM_API_KEY=your_sarvam_api_key
   ```
   *Note: Keys loaded via `.env` are automatically git-ignored, read securely by the backend, and masked on the frontend dashboard using `Saved (••••••••)` to prevent exposing cleartext values.*

4. **Run the Application**:
   You can easily launch the server using the pre-configured scripts:
   - **On Windows (Command Prompt)**:
     ```bash
     run.bat
     ```
   - **On Windows (PowerShell)**:
     ```powershell
     .\run.ps1
     ```
   - **Or manually**:
     ```bash
     .venv/Scripts/python.exe -X utf8 server.py
     ```
   Once started, access the web dashboard in your browser at `http://localhost:8000`.

---

## 📂 Project Structure

- `server.py`: The main FastAPI server orchestrating the background pipeline, RAG endpoints, and static file hosting.
- `frontend/`: The Vite + React frontend client.
  - `src/App.jsx`: Main React component managing pipeline state, custom timeline, tabbed navigation, and interactive chat.
  - `src/App.css` & `src/index.css`: Glassmorphic styling stylesheets.
  - `src/main.jsx`: React rendering entry point.
  - `vite.config.js`: Vite server and proxy configuration.
- `core/`: Core AI logic modules:
  - `transcriber.py`: Whisper-based speech-to-text.
  - `summarizer.py`: Summarization module.
  - `extractor.py`: Key insights (action items, decisions, questions) extraction.
  - `rag_engine.py` & `vector_store.py`: Vector search and LLM orchestrator.
- `utils/`: Audio downloading, slicing, and conversion utilities (`audio_processor.py`).
- `Requirements.txt`: Project backend dependencies.

---

## 🌐 Hosting & Deployment

To run Transcriva AI continuously in a production or staging cloud environment, choose one of the options below:

### Option 1: Standard Linux Server (Ubuntu/Debian VPS)

You can host Transcriva AI on a VPS (DigitalOcean, AWS EC2, Linode, etc.) using **Nginx** as a reverse proxy and **systemd** to manage the background process.

#### 1. Install System Dependencies
Update system packages and install Python, git, Nginx, and FFmpeg:
```bash
sudo apt update
sudo apt install -y python3-pip python3-venv git ffmpeg nginx
```

#### 2. Setup Project & Virtual Environment
Clone the repository, create a virtual environment, and install dependencies:
```bash
git clone https://github.com/Ayushgautam16/Transcriva-An-AI-Summarizer.git /var/www/transcriva
cd /var/www/transcriva
python3 -m venv .venv
source .venv/bin/activate
pip install -r Requirements.txt
pip install audioop-lts langchain-chroma fastapi uvicorn python-multipart
```

#### 3. Create systemd Service File
Create a system service file to run the FastAPI server:
```bash
sudo nano /etc/systemd/system/transcriva.service
```
Paste the service configuration:
```ini
[Unit]
Description=Transcriva AI FastAPI Server
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/transcriva
Environment="PYTHONIOENCODING=utf-8"
ExecStart=/var/www/transcriva/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl enable transcriva
sudo systemctl start transcriva
```

#### 4. Configure Nginx Reverse Proxy
Create a new Nginx server configuration block:
```bash
sudo nano /etc/nginx/sites-available/transcriva
```
Paste the server configuration (replace `yourdomain.com` with your domain or server IP):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase upload limit for large video/audio files
        client_max_body_size 500M;
    }
}
```
Link and test Nginx configuration, then reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/transcriva /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
*(Optional)* Secure your domain with SSL using Let's Encrypt Certbot:
```bash
sudo apt install snapd
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d yourdomain.com
```

---

### Option 2: Containerized Deployment (Docker)

If you prefer containerized deployment, create a `Dockerfile` in the root of the project:

```dockerfile
FROM python:3.11-slim

# Install system dependencies (ffmpeg is required)
RUN apt-get update && apt-get install -y ffmpeg git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files and install
COPY Requirements.txt .
RUN pip install --no-cache-dir -r Requirements.txt
RUN pip install --no-cache-dir audioop-lts langchain-chroma fastapi uvicorn python-multipart

# Copy project files
COPY . .

EXPOSE 8000

# Start server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run your Docker container:
```bash
docker build -t transcriva-ai .
docker run -d -p 8000:8000 \
  -e MISTRAL_API_KEY="your_key" \
  -e SARVAM_API_KEY="your_key" \
  --name transcriva-app transcriva-ai
```


