@echo off
REM ============================================================================
REM Cria as tarefas agendadas do MES Sync no servidor Syneco.
REM  >>> RODE ESTE ARQUIVO COMO ADMINISTRADOR <<<
REM  (clique direito > Executar como administrador)
REM ============================================================================

echo Removendo tarefas antigas do MES Sync (se existirem)...
schtasks /Delete /TN "MesSync"              /F >nul 2>&1
schtasks /Delete /TN "MesSync-Ordens"       /F >nul 2>&1
schtasks /Delete /TN "MesSync-Loop"         /F >nul 2>&1
schtasks /Delete /TN "MesSync-Diario"       /F >nul 2>&1
schtasks /Delete /TN "MesSync-Apontamentos" /F >nul 2>&1

echo.
echo Criando tarefa DIARIA (03:00) - carga completa...
schtasks /Create /TN "MesSync-Diario" /TR "C:\MesSync\mes-sync-diario.bat" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST /F

echo.
echo Criando tarefa a cada 10 MIN - apontamentos em tempo real...
schtasks /Create /TN "MesSync-Apontamentos" /TR "C:\MesSync\mes-sync-apontamentos.bat" /SC MINUTE /MO 10 /RU SYSTEM /RL HIGHEST /F

echo.
echo ============================================================================
echo Tarefas criadas. Conferindo:
schtasks /Query /TN "MesSync-Diario"       /FO LIST | findstr /i "Nome TaskName Status Proxima Next"
schtasks /Query /TN "MesSync-Apontamentos" /FO LIST | findstr /i "Nome TaskName Status Proxima Next"
echo ============================================================================
echo.
echo Se tinha OUTRA tarefa antiga com nome diferente rodando o agente completo,
echo apague ela para nao duplicar o sync de ordens. Para listar todas:
echo    schtasks /Query ^| findstr /i mes
echo.
pause
