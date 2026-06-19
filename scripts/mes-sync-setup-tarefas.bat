@echo off
REM ============================================================================
REM Cria as tarefas agendadas do MES Sync no servidor Syneco.
REM  >>> RODE ESTE ARQUIVO COMO ADMINISTRADOR <<<
REM  (clique direito > Executar como administrador)
REM ============================================================================

echo Removendo tarefas antigas do MES Sync (se existirem)...
schtasks /Delete /TN "MES Sync Portal Torg" /F >nul 2>&1
schtasks /Delete /TN "MesSync"              /F >nul 2>&1
schtasks /Delete /TN "MesSync-Ordens"       /F >nul 2>&1
schtasks /Delete /TN "MesSync-Loop"         /F >nul 2>&1
schtasks /Delete /TN "MesSync-Diario"       /F >nul 2>&1
schtasks /Delete /TN "MesSync-Apontamentos" /F >nul 2>&1
schtasks /Delete /TN "MesSync-Status"       /F >nul 2>&1

echo.
echo Criando tarefa a cada 10 MIN - apontamentos em tempo real...
schtasks /Create /TN "MesSync-Apontamentos" /TR "C:\MesSync\mes-sync-apontamentos.bat" /SC MINUTE /MO 10 /RU SYSTEM /RL HIGHEST /F

echo.
echo Criando tarefa a cada 10 MIN - status de setores inativos (furos)...
schtasks /Create /TN "MesSync-Status" /TR "C:\MesSync\mes-sync-status.bat" /SC MINUTE /MO 10 /RU SYSTEM /RL HIGHEST /F

echo.
echo Criando tarefa a cada 1 HORA - ordens (janela curta)...
schtasks /Create /TN "MesSync-Ordens" /TR "C:\MesSync\mes-sync-ordens.bat" /SC HOURLY /MO 1 /RU SYSTEM /RL HIGHEST /F

echo.
echo Criando tarefa DIARIA (03:00) - carga completa do historico...
schtasks /Create /TN "MesSync-Diario" /TR "C:\MesSync\mes-sync-diario.bat" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST /F

echo.
echo ============================================================================
echo Tarefas criadas. Conferindo:
schtasks /Query /TN "MesSync-Apontamentos" /FO LIST | findstr /i "Nome TaskName Status Proxima Next"
schtasks /Query /TN "MesSync-Status"       /FO LIST | findstr /i "Nome TaskName Status Proxima Next"
schtasks /Query /TN "MesSync-Ordens"       /FO LIST | findstr /i "Nome TaskName Status Proxima Next"
schtasks /Query /TN "MesSync-Diario"       /FO LIST | findstr /i "Nome TaskName Status Proxima Next"
echo ============================================================================
echo.
pause
