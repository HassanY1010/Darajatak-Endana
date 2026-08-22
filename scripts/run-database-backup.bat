@echo off
chcp 65001 >nul
cd /d "D:\Darajatak-Endana"
"C:\Program Files\nodejs\node.exe" "D:\Darajatak-Endana\src\database-backup\scheduler.js"
