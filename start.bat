@echo off
cd /d "c:\Users\ayush\OneDrive\Desktop\transcriva ai summarizer"
.venv\Scripts\python.exe -X utf8 -m uvicorn server:app --host 127.0.0.1 --port 8000
