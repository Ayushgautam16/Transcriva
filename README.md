# Transcriva AI 🎬

Transcriva AI is a state-of-the-art, private meeting intelligence dashboard. It processes video and audio meetings, transcribes content locally, extracts structured summaries, and provides an interactive Retrieval-Augmented Generation (RAG) chat assistant to query your meeting transcripts.

![Status](https://img.shields.io/badge/Status-Active-success) ![Python](https://img.shields.io/badge/Python-3.10%2B-blue) ![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

- **📊 Tabbed Dashboard**: Streamlined interface containing Overview, Key Insights, Full Transcript, and Chat Assistant.
- **📁 Multi-Source Input**: Supports YouTube video links, local files, and direct drag-and-drop audio/video uploads (`.mp3, .wav, .m4a, .mp4`).
- **🚀 Whisper Speed Controls**: Choose local Whisper model sizes (`Tiny`, `Base`, `Small`, `Medium`) to speed up CPU transcription by up to 10x.
- **🌐 Bilingual Transcribe**: Full support for English (via local Whisper) and Hinglish (Hindi + English via Sarvam AI API).
- **📋 Structured Insights**: Instantly extracts Meeting Title, Executive Summary, Action Items, Key Decisions, and Open Questions.
- **💬 Chat with Meeting**: Styled RAG chat workspace using Streamlit's native chat widgets, powered by Mistral AI, ChromaDB, and HuggingFace.
- **🔑 UI Credentials Manager**: Input and manage your API keys directly from the sidebar.

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
   uv pip install audioop-lts langchain-chroma
   ```
   Or using standard `pip`:
   ```bash
   pip install -r Requirements.txt
   pip install audioop-lts langchain-chroma
   ```

3. **Set Up Environment Variables** (Optional, can also be entered in the UI):
   Create a `.env` file in the root directory:
   ```env
   MISTRAL_API_KEY=your_mistral_api_key
   SARVAM_API_KEY=your_sarvam_api_key
   ```
4. **Run the Application**:
   To prevent encoding errors on Windows terminal console logs, start the app with:
   ```bash
   .venv/Scripts/python.exe -X utf8 -m streamlit run app.py
   ```
   Access the web dashboard in your browser at `http://localhost:8501`.

---

## 📂 Project Structure

- `app.py`: The main Streamlit dashboard app and custom styles.
- `core/`: Core AI logic modules (`transcriber.py`, `summarizer.py`, `extractor.py`, `rag_engine.py`, `vector_store.py`).
- `utils/`: Audio downloading, slicing, and conversion utils (`audio_processor.py`).
- `Requirements.txt`: Project dependencies list.
