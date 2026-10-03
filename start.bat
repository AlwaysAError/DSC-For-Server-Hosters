@echo off
cd /d "%~dp0"
node dsc-builder.cjs
if errorlevel 1 pause
