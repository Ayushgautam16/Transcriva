# Transcriva: An AI Summarizer (AI Video Assistant)

Transcriva is a powerful, AI-driven application designed to process video and audio meetings or presentations, transcribe the content, and generate insightful summaries. Built with Streamlit, LangChain, and state-of-the-art AI models, this tool offers a seamless way to extract value from your video content.

![Transcriva Banner](https://img.shields.io/badge/Status-Active-success) ![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue)

## ✨ Features

- **🎬 Video/Audio Acquisition**: Easily download audio from YouTube URLs or process local audio/video files.
- **📝 High-Quality Transcription**: Convert spoken audio into text using local OpenAI Whisper.
- **🌐 Bilingual Support**: Process content in English or Hinglish (Hindi + English) with built-in translation via Deep Translator.
- **🧠 Smart Summarization**: Generate concise summaries of lengthy meetings or videos powered by Mistral AI via LangChain.
- **🔍 Actionable Insights**: Automatically identify and extract Action Items, Key Decisions, and Open Questions.
- **💬 RAG Chat Engine**: Chat directly with your meeting transcripts using a Retrieval-Augmented Generation (RAG) system built with ChromaDB and HuggingFace embeddings.
- **🎨 Sleek UI**: A beautiful, responsive, and animated user interface built using Streamlit with custom CSS.

## 🛠️ Tech Stack

- **Frontend**: Streamlit
- **Audio Processing**: `yt-dlp`, `pydub`, `ffmpeg-python`
- **Speech-to-Text**: `openai-whisper` (running locally via PyTorch)
- **Translation**: `deep-translator`
- **LLM Orchestration**: LangChain (`langchain-mistralai`)
- **Vector Store & Embeddings**: ChromaDB, `sentence-transformers`, `huggingface-hub`
- **Environment Management**: `python-dotenv`

## ⚙️ Prerequisites

- **Python**: Version 3.10 or higher.
- **FFmpeg**: Must be installed on your system and available in your system's PATH.
- **API Keys**: A Mistral API key (or a suitable LLM configured) is required for the summarization and RAG chat features.

## 🚀 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Ayushgautam16/Transcriva-An-AI-Summarizer.git
   cd Transcriva-An-AI-Summarizer/AI-Video-Assistant-
   ```

2. **Create a virtual environment** (Optional but highly recommended):
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install the dependencies**:
   ```bash
   pip install -r Requirements.txt
   ```

4. **Set up environment variables**:
   Create a `.env` file in the `AI-Video-Assistant-` directory and add your API keys:
   ```env
   MISTRAL_API_KEY=your_mistral_api_key_here
   # Add any other required environment variables based on the exact core setup
   ```

## 🎮 Usage

1. **Run the Streamlit application**:
   ```bash
   streamlit run app.py
   ```

2. **Using the Application**:
   - **Input**: Paste a YouTube URL or provide a local file path (e.g., `C:/path/to/video.mp4`) in the sidebar.
   - **Language**: Select the spoken language (English or Hinglish).
   - **Analyze**: Click the "⚡ Analyse" button to trigger the processing pipeline.
   - **View Results**: Once completed, view the generated Title, Summary, Full Transcript, Action Items, Key Decisions, and Open Questions.
   - **Chat**: Scroll down to the "💬 Chat with your Meeting" section to ask specific questions about the processed content.

## 📂 Project Structure
- `app.py`: The main Streamlit entry point.
- `core/`: Contains core business logic modules for transcription, summarization, extraction, and RAG.
- `utils/`: Utility functions for downloading and audio processing.
- `Requirements.txt`: Project dependencies and libraries.

## 🚀 Deployment

Because this application uses **Streamlit** (which requires WebSockets) and heavy Machine Learning libraries like **PyTorch** and **Whisper** alongside system-level dependencies like **FFmpeg**, it is **not suitable for Vercel** (which is designed for lightweight, serverless functions with strict size and timeout limits).

Here are the recommended platforms to host this application:

### 1. Hugging Face Spaces (Recommended)
Hugging Face Spaces natively supports Streamlit and AI models.
1. Create a new Space on [Hugging Face](https://huggingface.co/spaces) and select **Streamlit** as the SDK.
2. Upload your files (`app.py`, `Requirements.txt`, `core/`, `utils/`).
3. Add a `packages.txt` file in the root containing `ffmpeg` (this tells the server to install FFmpeg).
4. Add your `MISTRAL_API_KEY` in the Space's **Settings > Variables and secrets**.

### 2. Streamlit Community Cloud
1. Push your code to a public GitHub repository.
2. Go to [Streamlit Community Cloud](https://share.streamlit.io/) and click **New app**.
3. Select your repository, branch, and set the main file path to `AI-Video-Assistant-/app.py`.
4. Ensure you have the `packages.txt` file containing `ffmpeg` in the same directory.
5. Add your `MISTRAL_API_KEY` in the App's **Advanced Settings > Secrets**.

### 3. Render or Railway
For full control, you can host this using a `Dockerfile` on Render or Railway, which allows you to install OS-level dependencies (FFmpeg) and run the Streamlit server seamlessly.

## 📄 License
This project is open-sourced under the MIT License.
