@echo off
REM ============================================================================
REM MES Sync - ORDENS (a cada 1 hora)
REM   - So ordens (dataset 150), janela = ORDENS_DIAS_ATRAS do .env (ex: 90)
REM   - Janela curta = leve, sem risco de OOM rodando de hora em hora.
REM   - A carga completa de 3 anos fica na tarefa diaria (mes-sync-diario.bat).
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
node mes-sync-agent.js --so-ordens
