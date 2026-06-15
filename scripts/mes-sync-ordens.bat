@echo off
REM ============================================================================
REM MES Sync - ORDENS (a cada 1 hora) - SO AS PRODUZIDAS
REM   - --so-ordens --produzidas: envia so as linhas COM producao (~milhares),
REM     pulando as ~50k planejadas que nao mudam de hora em hora.
REM   - Janela = ORDENS_DIAS_ATRAS do .env (ex: 7). Leve, sem risco de OOM.
REM   - O plano completo (3 anos) e carregado pela tarefa diaria (03:00).
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
node mes-sync-agent.js --so-ordens --produzidas
