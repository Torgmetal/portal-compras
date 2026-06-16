@echo off
REM ============================================================================
REM MES Sync - TEMPO REAL (roda a cada 10 min)
REM   - Apontamentos (dataset 242), janela = SYNC_DIAS_ATRAS do .env (ex: 3)
REM   - Ordens DO DIA (dataset 150, flag --hoje): fetch largo (120d, p/ alcancar
REM     o inicio de operacoes antigas corrigidas hoje) mas envia SO as linhas com
REM     Fim/Inicio dos ultimos 3 dias ou em producao (~300 linhas). Sem risco de OOM.
REM   - Assim uma correcao feita no Syneco aparece no portal em ate 10 min.
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
node mes-sync-agent.js --hoje
