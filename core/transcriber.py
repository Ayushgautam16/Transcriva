import os
import requests
from pydub import AudioSegment

# Sarvam's sync STT-translate API rejects audio longer than 30s.
# We slice each chunk into 25s pieces (with a 5s safety margin) before sending.
SARVAM_PIECE_SECONDS = 25


WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")


SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_STT_TRANSLATE_URL = "https://api.sarvam.ai/speech-to-text-translate"
SARVAM_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v2.5") 

_model = None
_loaded_model_name = None


def load_model(model_name: str = None):

    global _model, _loaded_model_name  

    if model_name is None:
        model_name = WHISPER_MODEL

    if _model is None or _loaded_model_name != model_name:
        print(f"Loading Whisper model: {model_name} ...")
        # Free old model memory if loading a different one.
        _model = None
        import gc
        gc.collect()

        try:
            import torch
        except Exception:
            torch = None

        if torch and torch.cuda.is_available():
            torch.cuda.empty_cache()

        try:
            import whisper
            _model = whisper.load_model(model_name)
        except Exception as exc:
            raise RuntimeError(
                "Whisper model failed to load. Ensure torch/whisper are installed "
                "and compatible with your Python/OS setup."
            ) from exc

        _loaded_model_name = model_name
        print(f"Whisper model {model_name} loaded.")
    return _model


def transcribe_chunk_whisper(chunk_path: str, whisper_model: str = None) -> str:

    model = load_model(whisper_model)  

    result = model.transcribe(chunk_path, task="transcribe")  
    return result["text"]  


def _send_to_sarvam(piece_path: str) -> str:
    """Send one ≤30s WAV file to Sarvam and return the English transcript."""
    sarvam_key = os.getenv("SARVAM_API_KEY")
    headers = {"api-subscription-key": sarvam_key}

    with open(piece_path, "rb") as f:
        files = {"file": (os.path.basename(piece_path), f, "audio/wav")}
        data = {"model": SARVAM_MODEL, "with_diarization": "false"}
        response = requests.post(
            SARVAM_STT_TRANSLATE_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=120,
        )

    if not response.ok:
        print(f"\n[ERROR] Sarvam returned {response.status_code}")
        print(f"Response body: {response.text}\n")
        response.raise_for_status()

    return response.json().get("transcript", "")


def transcribe_chunk_sarvam(chunk_path: str) -> str:
    """
    Sarvam sync API only accepts ≤30s audio. We split this chunk into
    25-second pieces, send each separately, and join the transcripts.
    """
    sarvam_key = os.getenv("SARVAM_API_KEY")
    if not sarvam_key:
        raise RuntimeError("SARVAM_API_KEY is not set in environment / .env")

    audio = AudioSegment.from_wav(chunk_path)
    piece_ms = SARVAM_PIECE_SECONDS * 1000

    full_text = ""
    total_pieces = (len(audio) + piece_ms - 1) // piece_ms

    for i, start in enumerate(range(0, len(audio), piece_ms)):
        piece = audio[start: start + piece_ms]
        piece_path = f"{chunk_path}_sv_{i}.wav"
        piece.export(piece_path, format="wav")

        try:
            print(f"  -> Sarvam piece {i + 1}/{total_pieces} ...")
            full_text += _send_to_sarvam(piece_path) + " "
        finally:
            if os.path.exists(piece_path):
                os.remove(piece_path)

    return full_text.strip()

   



def transcribe_chunk(chunk_path: str, language: str = "english", whisper_model: str = "small") -> str:
    """
    Route one chunk to Whisper or Sarvam depending on language choice.
    - english  → Whisper (local model)
    - hinglish → Sarvam (translates to English while transcribing)
    """
    if language.lower() == "hinglish":
        return transcribe_chunk_sarvam(chunk_path)
    return transcribe_chunk_whisper(chunk_path, whisper_model)


def transcribe_all(chunks: list, language: str = "english", whisper_model: str = "small") -> str:

    full_transcript = "" 

    engine = "Sarvam AI" if language.lower() == "hinglish" else f"Whisper ({whisper_model})"
    print(f"Using {engine} for transcription.")

    for i, chunk in enumerate(chunks):  

        print(f"Transcribing chunk {i + 1}/{len(chunks)}...")

        text = transcribe_chunk(chunk, language=language, whisper_model=whisper_model)  

        full_transcript += text + " "  

    print("Transcription complete.")

    return full_transcript.strip()  
