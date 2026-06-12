@echo off
REM ============================================================================
REM MES Sync - DIARIO (carga completa, roda 1x por dia de madrugada)
REM   - Ordens (snapshot dataset 150): ultimos 3 anos (todo o historico)
REM   - Apontamentos (dataset 242): ultimos 30 dias (rede de seguranca)
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
node mes-sync-agent.js --anos 3 --apont-dias 30
