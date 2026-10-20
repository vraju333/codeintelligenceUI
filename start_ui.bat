@echo off
cd /d "%~dp0"
if not exist .venv (py -m venv .venv)
call .venv\Scripts\activate.bat
pip install -r requirements.txt
set CI_BACKEND_URL=http://127.0.0.1:8081
python -m uvicorn app:app --reload --port 8090
