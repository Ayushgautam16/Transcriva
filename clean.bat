@echo off
python clean_temp.py
del /f /q downloads\*.* 2>nul
rmdir /s /q downloades 2>nul
for /d /r . %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d"
echo Clean completed

