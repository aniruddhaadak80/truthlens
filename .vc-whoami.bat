@echo off
cd /d C:\Users\ANIRUDDHA\Desktop\Projects\truthlens
vercel whoami > %TEMP%\opencode\vercel-whoami.log 2>&1
echo EXIT=%ERRORLEVEL% >> %TEMP%\opencode\vercel-whoami.log
