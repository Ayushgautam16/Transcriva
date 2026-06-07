# Transcriva AI 🎬

Transcriva AI is a state-of-the-art, private meeting intelligence dashboard. It processes video and audio meetings, transcribes content locally, extracts structured summaries, and provides an interactive Retrieval-Augmented Generation (RAG) chat assistant to query your meeting transcripts.

Now powered by a high-performance **FastAPI backend** and a bespoke, responsive **vanilla HTML/CSS/JS frontend**, the application features an asynchronous processing pipeline, live status tracking, and a gorgeous modern UI.

![Status](https://img.shields.io/badge/Status-Active-success) ![Python](https://img.shields.io/badge/Python-3.10%2B-blue) ![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **📊 Tabbed Dashboard**: Streamlined interface containing Overview (Executive Summary & Media Player), Key Insights, Full Transcript, and Chat Assistant.
- **⚡ Asynchronous Pipeline**: Track each stage of the analysis process (Audio Processing → Transcription → Title Generation → Summarisation → Extraction → RAG Engine) in real-time via the sidebar timeline.
- **📁 Multi-Source Input**: Supports YouTube video links, local files, and direct drag-and-drop audio/video uploads (`.mp3, .wav, .m4a, .mp4`).
- **🚀 Whisper Speed Controls**: Choose local Whisper model sizes (`Tiny`, `Base`, `Small`, `Medium`) to speed up CPU transcription by up to 10x.
- **🌐 Bilingual Transcribe**: Full support for English (via local Whisper) and Hinglish (Hindi + English via Sarvam AI API).
- **📋 Structured Insights**: Instantly extracts Meeting Title, Executive Summary, Action Items, Key Decisions, and Open Questions.
- **💬 Chat with Meeting**: Beautifully styled RAG chat workspace using natural language queries, powered by Mistral AI, ChromaDB, and HuggingFace.
- **🔑 UI Credentials Manager**: Input and manage your API keys and YouTube cookies directly from the sidebar.

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

3. **Set Up Environment Variables** (Optional, can also be entered in the UI):
   Create a `.env` file in the root directory:
   ```env
   MISTRAL_API_KEY=your_mistral_api_key
   SARVAM_API_KEY=your_sarvam_api_key
   ```

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
- `static/`: The frontend application directory.
  - `index.html`: The HTML5 structure featuring Google Fonts and semantic layouts.
  - `style.css`: Premium vanilla CSS stylesheet featuring dark modes, smooth transitions, and responsive grid layouts.
  - `main.js`: Vanilla JS managing AJAX requests, drag-and-drop file upload progress, dynamic UI status updates, and interactive chat.
- `core/`: Core AI logic modules:
  - `transcriber.py`: Whisper-based speech-to-text.
  - `summarizer.py`: Summarization module.
  - `extractor.py`: Key insights (action items, decisions, questions) extraction.
  - `rag_engine.py` & `vector_store.py`: Vector search and LLM orchestrator.
- `utils/`: Audio downloading, slicing, and conversion utilities (`audio_processor.py`).
- `Requirements.txt`: Project backend dependencies.

