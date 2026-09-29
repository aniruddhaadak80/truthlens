@echo off
cd /d C:\Users\ANIRUDDHA\Desktop\Projects\truthlens
vercel link --yes --project truthlens --repo aniruddhaadak80/truthlens > %TEMP%\opencode\vercel-link.log 2>&1
echo EXIT=%ERRORLEVEL% >> %TEMP%\opencode\vercel-link.log
