@echo off
cd /d C:\Users\ANIRUDDHA\Desktop\Projects\truthlens
set /p DBURL=<%TEMP%\opencode\truthlens-db-url.txt
echo %DBURL% | vercel env add DATABASE_URL production --force >> %TEMP%\opencode\vercel-env.log 2>&1
echo EXIT=%ERRORLEVEL% >> %TEMP%\opencode\vercel-env.log
