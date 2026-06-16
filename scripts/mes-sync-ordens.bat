@echo off
REM ============================================================================
REM MES Sync - ORDENS reconciliacao (a cada 1 hora)
REM   - So ordens (dataset 150) DO DIA com janela de envio de 7 dias (--hoje-dias 7).
REM   - Rede de seguranca entre a tarefa de 10 min (3 dias) e a diaria (3 anos):
REM     pega qualquer correcao da ultima semana caso uma rodada de 10 min falhe.
REM   - LEVE (~centenas de linhas) — substitui o antigo "--so-ordens" que escrevia
REM     ~54 mil linhas/hora e estourava a memoria do Neon (OOM).
REM Copie este arquivo para C:\MesSync\
REM ============================================================================
cd /d C:\MesSync
node mes-sync-agent.js --so-ordens --hoje --hoje-dias 7
