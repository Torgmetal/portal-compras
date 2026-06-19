# mes-sync-status.ps1 (ASCII) - Sincroniza setores INATIVOS-SEM-PRODUCAO (feitos fora)
# do Syneco (Production.IsEnabled=0 e PartCount=0) para o portal, para o relatorio de furos.
# SOMENTE LEITURA no Syneco (so SELECT). Escreve apenas no portal (POST autenticado).
#
# Conexao ao banco: usa login SQL do .env (SKA_DB_USER/SKA_DB_PASS) se existir
# (funciona sob qualquer conta, inclusive SYSTEM na tarefa agendada); senao tenta
# autenticacao Windows.
#
# Instalar em C:\MesSync\. Agendado a cada 10 min (ver mes-sync-setup-tarefas.bat).
# Manual: powershell -ExecutionPolicy Bypass -File C:\MesSync\mes-sync-status.ps1
# Log: C:\MesSync\mes-sync-status.log

$Server  = "DESKTOP-IONH0V7\SQLEXPRESS"
$DB      = "TORG_SYNECO"
$EnvFile = "C:\MesSync\.env"
$LogFile = "C:\MesSync\mes-sync-status.log"

function Log([string]$m){ $l="[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m; Write-Host $l; Add-Content -Path $LogFile -Value $l }

# Le config do .env do agente
$PortalUrl=$null; $PortalKey=$null; $SqlUser=$null; $SqlPass=$null
foreach($line in (Get-Content $EnvFile -ErrorAction SilentlyContinue)){
  if($line -match '^\s*PORTAL_API_URL\s*=\s*(.+?)\s*$'){ $PortalUrl=$Matches[1].Trim('"') }
  if($line -match '^\s*PORTAL_API_KEY\s*=\s*(.+?)\s*$'){ $PortalKey=$Matches[1].Trim('"') }
  if($line -match '^\s*SKA_DB_USER\s*=\s*(.+?)\s*$'){ $SqlUser=$Matches[1].Trim('"') }
  if($line -match '^\s*SKA_DB_PASS\s*=\s*(.+?)\s*$'){ $SqlPass=$Matches[1].Trim('"') }
}
if(-not $PortalUrl){ $PortalUrl="https://workspace.torg.com.br" }
if(-not $PortalKey){ Log "ERRO: PORTAL_API_KEY nao encontrada no .env"; exit 1 }

# Abre conexao: login SQL (se houver no .env) com fallback p/ autenticacao Windows
function OpenDb {
  $base = "Server=$Server;Database=$DB;TrustServerCertificate=True;Encrypt=False;Connect Timeout=15"
  if($SqlUser){
    try {
      $c = New-Object System.Data.SqlClient.SqlConnection "$base;User Id=$SqlUser;Password=$SqlPass"
      $c.Open(); return $c
    } catch { Log ("Login SQL ($SqlUser) falhou, tentando Windows: " + $_.Exception.Message.Split([Environment]::NewLine)[0]) }
  }
  $c = New-Object System.Data.SqlClient.SqlConnection "$base;Integrated Security=True"
  $c.Open(); return $c
}

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
  $cn=OpenDb
  $cmd=$cn.CreateCommand(); $cmd.CommandText=$sql; $cmd.CommandTimeout=120
  $rd=$cmd.ExecuteReader()
  while($rd.Read()){ $rows.Add(@{ op="$($rd['op'])"; item="$($rd['item'])"; operacao="$($rd['operacao'])" }) }
  $rd.Close()
} catch { Log ("ERRO SQL: "+$_.Exception.Message.Split([Environment]::NewLine)[0]); if($cn){$cn.Close()}; exit 1 }
finally { if($cn){$cn.Close()} }

Log ("Setores inativos-sem-producao lidos: " + $rows.Count)

# POST para o portal (substitui a lista inteira).
# JSON montado a mao (ConvertTo-Json do PS 5.1 estoura com lista de hashtables).
function JEsc([string]$s){ if($null -eq $s){return ""}; return $s.Replace('\','\\').Replace('"','\"') }
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{"inativos":[')
$first = $true
foreach($r in $rows){
  if(-not $first){ [void]$sb.Append(',') }
  $first = $false
  [void]$sb.Append('{"op":"' + (JEsc $r.op) + '","item":"' + (JEsc $r.item) + '","operacao":"' + (JEsc $r.operacao) + '"}')
}
[void]$sb.Append(']}')
$payload = $sb.ToString()
Log ("Payload bytes: " + $payload.Length)

try{
  $resp = Invoke-RestMethod -Method Post -Uri "$PortalUrl/api/mes/sync-status" -Headers @{ Authorization = "Bearer $PortalKey" } -ContentType "application/json" -Body $payload -TimeoutSec 120
  Log ("Portal OK: ok=" + $resp.ok + " inativos=" + $resp.inativos)
} catch {
  Log ("ERRO POST portal: " + $_.Exception.Message.Split([Environment]::NewLine)[0])
  exit 1
}
