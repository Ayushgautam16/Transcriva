"""Test script for processing local audio files"""
from utils.audio_processor import process_input

# Example usage with local audio file
# Place your audio file (mp3, wav, m4a, etc.) in the project folder first

try:
    # Replace "my_audio.mp3" with your actual audio filename
    chunks = process_input(r"C:\Users\ayush\Downloads\WhatsApp_Audio_2026_05_20_at_18.10.04_clean.mp3")
    print(f"✅ Successfully created {len(chunks)} audio chunks")
    print(f"Chunks saved at:")
    for chunk in chunks:
        print(f"  - {chunk}")
except FileNotFoundError:
    print("❌ Audio file not found. Make sure to add your audio file to the project folder.")
except Exception as e:
    print(f"❌ Error: {e}")
