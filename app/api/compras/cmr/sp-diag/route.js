// DIAGNÓSTICO (só leitura, só ADMIN) da planilha CMR do ano no SharePoint.
//   GET /api/compras/cmr/sp-diag?ano=2026
// Serve pra descobrir a estrutura real do arquivo antes de ligar a gravação:
//   - qual arquivo/tamanho está em uso na pasta de rastreabilidade
//   - se a API de Excel do Graph abre esse workbook (limite de tamanho)
//   - nome da aba de dados, se há "Tabela" (ListObject), e onde termina o range
//   - as primeiras linhas (pra localizar o cabeçalho e mapear as colunas)
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const GRAPH = "https://graph.microsoft.com/v1.0";

export async function GET(req) {
  try { await requireRole(["ADMIN"]); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getFullYear();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!driveId) return NextResponse.json({ error: "SHAREPOINT_DRIVE_ID não configurado" }, { status: 500 });

  const out = { ano, ok: false, etapas: {} };
  try {
    const token = await getAccessToken();
    const H = { Authorization: `Bearer ${token}` };

    // 1) achar o arquivo CMR do ano (mesma lógica do baixarCmrAtual)
    const s = await fetch(`${GRAPH}/drives/${driveId}/root/search(q='${encodeURIComponent(`CMR TORG-${ano}`)}')?$select=id,name&$top=20`, { headers: H });
    const achados = ((await s.json()).value || []).filter((x) => /\.xlsx?$/i.test(x.name) && x.name.toUpperCase().includes(`CMR TORG-${ano}`));
    out.etapas.arquivosEncontrados = achados.map((a) => a.name);
    const det = [];
    for (const a of achados) {
      const r = await fetch(`${GRAPH}/drives/${driveId}/items/${a.id}?$select=id,name,size,lastModifiedDateTime,parentReference,webUrl`, { headers: H });
      if (r.ok) det.push(await r.json());
    }
    const naPasta = det.filter((d) => /rastreabilidade/i.test(decodeURIComponent(d.parentReference?.path || "")));
    const lista = (naPasta.length ? naPasta : det).sort((a, b) => new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime));
    const alvo = lista[0];
    if (!alvo) { out.etapas.erro = "Nenhum arquivo CMR do ano encontrado."; return NextResponse.json(out); }
    out.arquivo = { nome: alvo.name, sizeMB: +(alvo.size / 1048576).toFixed(2), modificadoEm: alvo.lastModifiedDateTime, pasta: decodeURIComponent(alvo.parentReference?.path || "").split("root:")[1] || null, webUrl: alvo.webUrl };
    const itemId = alvo.id;

    // 2) a API de Excel do Graph abre esse workbook? (aqui bate o limite de tamanho)
    const ws = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/workbook/worksheets?$select=name,position,visibility`, { headers: H });
    const wsBody = await ws.json();
    out.etapas.workbookApi = ws.ok ? "OK" : `FALHOU ${ws.status}: ${JSON.stringify(wsBody?.error || wsBody).slice(0, 300)}`;
    if (!ws.ok) return NextResponse.json(out);
    out.abas = (wsBody.value || []).map((w) => ({ nome: w.name, visivel: w.visibility }));

    // 3) aba de dados: a de nome = ano (4 dígitos) senão a 1ª
    const nomes = (wsBody.value || []).map((w) => w.name);
    const aba = nomes.find((n) => String(n).trim() === String(ano)) || nomes.find((n) => /^\d{4}$/.test(String(n).trim())) || nomes[0];
    out.abaDados = aba;

    const enc = encodeURIComponent(aba);
    const tb = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/workbook/worksheets('${enc}')/tables?$select=name,showHeaders,legacyId`, { headers: H });
    const tbBody = await tb.json();
    out.tabelas = tb.ok ? (tbBody.value || []).map((t) => t.name) : `erro ${tb.status}`;

    const ur = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/workbook/worksheets('${enc}')/usedRange(valuesOnly=true)?$select=address,rowCount,columnCount`, { headers: H });
    const urBody = await ur.json();
    out.usedRange = ur.ok ? { address: urBody.address, linhas: urBody.rowCount, colunas: urBody.columnCount } : `erro ${ur.status}: ${JSON.stringify(urBody?.error || urBody).slice(0, 200)}`;

    // 4) primeiras 4 linhas (pra localizar o cabeçalho e mapear colunas)
    if (ur.ok && urBody.address) {
      const col = urBody.columnCount, colFim = colLetra(col);
      const rangeTopo = `${aba}!A1:${colFim}4`;
      const rr = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/workbook/worksheets('${enc}')/range(address='${encodeURIComponent(rangeTopo)}')?$select=values`, { headers: H });
      const rrBody = await rr.json();
      out.primeirasLinhas = rr.ok ? rrBody.values : `erro ${rr.status}`;
    }

    out.ok = true;
    return NextResponse.json(out);
  } catch (e) {
    out.erro = e.message;
    return NextResponse.json(out, { status: 500 });
  }
}

// nº da coluna (1-based) → letra ("A", "Z", "AA"...)
function colLetra(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s || "A";
}
