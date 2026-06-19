# mes-sync-status.ps1 (ASCII) - Sincroniza setores INATIVOS-SEM-PRODUCAO (feitos fora)
# do Syneco (Production.IsEnabled=0 e PartCount=0) para o portal, para o relatorio de furos.
# SOMENTE LEITURA no Syneco (so SELECT). Escreve apenas no portal (POST autenticado).
#
# Instalar em C:\MesSync\ (mesma pasta do agente). Rodar a cada 10 min (Task Scheduler):
#   schtasks /Create /TN "MES Sync Status" /TR "powershell -ExecutionPolicy Bypass -File C:\MesSync\mes-sync-status.ps1" /SC MINUTE /MO 10 /F
# A tarefa precisa rodar sob uma conta com acesso ao banco (autenticacao Windows).
# Manual: powershell -ExecutionPolicy Bypass -File C:\MesSync\mes-sync-status.ps1
# Log: C:\MesSync\mes-sync-status.log

$Server  = "DESKTOP-IONH0V7\SQLEXPRESS"
$DB      = "TORG_SYNECO"
$EnvFile = "C:\MesSync\.env"
$LogFile = "C:\MesSync\mes-sync-status.log"

function Log([string]$m){ $l="[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; Write-Host $l; Add-Content -Path $LogFile -Value $l }

# Le PORTAL_API_URL e PORTAL_API_KEY do .env do agente
$PortalUrl=$null; $PortalKey=$null
foreach($line in (Get-Content $EnvFile -ErrorAction SilentlyContinue)){
  if($line -match '^\s*PORTAL_API_URL\s*=\s*(.+?)\s*$'){ $PortalUrl=$Matches[1].Trim('"') }
  if($line -match '^\s*PORTAL_API_KEY\s*=\s*(.+?)\s*$'){ $PortalKey=$Matches[1].Trim('"') }
}
if(-not $PortalUrl){ $PortalUrl="https://workspace.torg.com.br" }
if(-not $PortalKey){ Log "ERRO: PORTAL_API_KEY nao encontrada no .env"; exit 1 }

# Consulta os setores inativos-sem-producao, SO de OPs que ainda tem setor ativo (em andamento)
$sql = @"
SELECT p.OrderNum AS op, p.PartCode AS item, p.Operation AS operacao
FROM Production p
WHERE p.IsEnabled = 0 AND ISNULL(p.PartCount,0) = 0
  AND p.OrderNum IS NOT NULL AND p.PartCode IS NOT NULL AND p.Operation IS NOT NULL
  AND EXISTS (SELECT 1 FROM Production p2 WHERE p2.OrderNum = p.OrderNum AND p2.IsEnabled = 1)
"@

$rows = New-Object System.Collections.Generic.List[object]
$cn=$null
try{
  $cn=New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$DB;Integrated Security=True;TrustServerCertificate=True;Encrypt=False;Connect Timeout=15"
  $cn.Open(); $cmd=$cn.CreateCommand(); $cmd.CommandText=$sql; $cmd.CommandTimeout=120
  $rd=$cmd.ExecuteReader()
  while($rd.Read()){ $rows.Add(@{ op="$($rd['op'])"; item="$($rd['item'])"; operacao="$($rd['operacao'])" }) }
  $rd.Close()
} catch { Log ("ERRO SQL: "+$_.Exception.Message.Split([Environment]::NewLine)[0]); if($cn){$cn.Close()}; exit 1 }
finally { if($cn){$cn.Close()} }

Log ("Setores inativos-sem-producao lidos: " + $rows.Count)

# POST para o portal (substitui a lista inteira)
$payload = @{ inativos = $rows } | ConvertTo-Json -Depth 4 -Compress
try{
  $resp = Invoke-RestMethod -Method Post -Uri "$PortalUrl/api/mes/sync-status" `
            -Headers @{ Authorization = "Bearer $PortalKey" } `
            -ContentType "application/json" -Body $payload -TimeoutSec 120
  Log ("Portal OK: " + ($resp | ConvertTo-Json -Compress))
} catch {
  Log ("ERRO POST portal: " + $_.Exception.Message.Split([Environment]::NewLine)[0])
  exit 1
}
