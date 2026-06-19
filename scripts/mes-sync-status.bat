@echo off
REM ============================================================================
REM MES Sync - STATUS (setores inativos / feitos fora) p/ o relatorio de furos.
REM   - Roda a cada 10 min. Le do banco do Syneco (Production.IsEnabled=0 e
REM     PartCount=0) e faz POST ao portal (/api/mes/sync-status), que substitui
REM     a tabela MesInativo. So o relatorio de furos usa isso.
REM   - Conexao SQL via SKA_DB_USER/SKA_DB_PASS do .env (fallback Windows).
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
powershell -ExecutionPolicy Bypass -File C:\MesSync\mes-sync-status.ps1
