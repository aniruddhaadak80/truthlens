@echo off
cd /d C:\Users\ANIRUDDHA\Desktop\Projects\truthlens
vercel deploy --prod --yes > %TEMP%\opencode\vercel-deploy.log 2>&1
echo EXIT=%ERRORLEVEL% >> %TEMP%\opencode\vercel-deploy.log
