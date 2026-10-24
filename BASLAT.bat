@echo off
chcp 65001 >nul
title DUST STRIKE Sunucusu
cd /d "%~dp0"
if not exist node_modules (
  echo Gerekli paketler kuruluyor...
  call npm install
)
node server.js
pause
