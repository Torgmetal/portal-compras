@echo off
REM ============================================================================
REM MES Sync - APONTAMENTOS (tempo real, roda a cada 10 min)
REM   - So apontamentos (dataset 242), janela = SYNC_DIAS_ATRAS do .env (ex: 3)
REM   - NAO roda ordens (o snapshot pesado fica no diario), entao sem risco de OOM
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
node mes-sync-agent.js --so-apontamentos
