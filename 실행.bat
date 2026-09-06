@echo off
title 경산자인학교 과정중심평가 관리 - 이 창을 닫지 마세요
cd /d "%~dp0"

where python > nul 2>&1
if errorlevel 1 goto NOPYTHON

echo.
echo   경산자인학교 과정중심평가 관리
echo   ==================================
echo.
echo   브라우저가 곧 열립니다.
echo   이 창을 닫으면 앱도 닫힙니다. 다 쓰신 뒤에 닫아 주세요.
echo.

start "" http://127.0.0.1:8000
python -m http.server 8000 --bind 127.0.0.1
goto END

:NOPYTHON
echo.
echo   [실행할 수 없습니다] 파이썬이 설치되어 있지 않습니다.
echo.
echo   https://www.python.org/downloads/ 에서 설치해 주세요.
echo   설치 화면에서 "Add Python to PATH" 를 꼭 체크하셔야 합니다.
echo.
pause

:END
