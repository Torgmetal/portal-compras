// Writeback do CMR para a planilha do ano no SharePoint (espelho pra consulta/auditoria).
// Só o portal lança → aqui a gente ANEXA a linha no fim da aba do ano, no arquivo em nuvem,
// via API de Excel do Graph (sem baixar/subir o arquivo de 16MB inteiro).
// Estrutura confirmada pelo /api/compras/cmr/sp-diag (arquivo CMR TORG-{ano}.xlsx):
//   - pasta "/Almoxarifado/01. Rastreabilidade"; aba de dados = nome do ano (ex.: "2026")
//   - SEM Tabela (ListObject); cabeçalho na linha 4; dados de A..N (14 colunas):
//     A R/RC · B ÍNDICE R · C DESCRIÇÃO · D Nº CERTIFICADO · E LOTE/CORRIDA · F ESPECIFICAÇÃO
//     G PEDIDO · H DATA RECEB · I Nº NF · J FORNECEDOR · K OBRA · L QTD PÇS · M PESO/LITRO · N OBS
import { getAccessToken } from "@/lib/sharepoint";
import { parseData } from "@/lib/cmr";

const GRAPH = "https://graph.microsoft.com/v1.0";
const so = (v) => (v == null ? "" : String(v).trim());

function fmtDataBR(v) {
  const d = parseData(v);
  if (!d) return so(v);
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function num(v) {
  if (v == null || v === "") return "";
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : so(v);
}
// nº da coluna (1-based) → letra
function colLetra(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s || "A"; }

// Acha o arquivo CMR TORG-{ano}.xlsx na pasta de rastreabilidade (sem baixar).
async function acharItemCmr(ano, driveId, auth) {
  const s = await fetch(`${GRAPH}/drives/${driveId}/root/search(q='${encodeURIComponent(`CMR TORG-${ano}`)}')?$select=id,name&$top=20`, { headers: auth });
  if (!s.ok) throw new Error(`SharePoint busca HTTP ${s.status}`);
  const achados = ((await s.json()).value || []).filter((x) => /\.xlsx?$/i.test(x.name) && x.name.toUpperCase().includes(`CMR TORG-${ano}`));
  if (!achados.length) throw new Error(`Planilha "CMR TORG-${ano}" não encontrada.`);
  const det = [];
  for (const a of achados) {
    const r = await fetch(`${GRAPH}/drives/${driveId}/items/${a.id}?$select=id,name,parentReference,lastModifiedDateTime`, { headers: auth });
    if (r.ok) det.push(await r.json());
  }
  const naPasta = det.filter((d) => /rastreabilidade/i.test(decodeURIComponent(d.parentReference?.path || "")));
  const lista = (naPasta.length ? naPasta : det).sort((a, b) => new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime));
  if (!lista[0]) throw new Error("Planilha CMR não acessível.");
  return lista[0].id;
}

async function abaDeDados(base, ano, headers) {
  const ws = await fetch(`${base}/worksheets?$select=name`, { headers });
  if (!ws.ok) throw new Error(`worksheets HTTP ${ws.status}`);
  const nomes = ((await ws.json()).value || []).map((w) => w.name);
  return nomes.find((n) => so(n) === String(ano)) || nomes.find((n) => /^\d{4}$/.test(so(n))) || nomes[0];
}

/**
 * Anexa 1..N lançamentos no fim da aba do ano da planilha CMR no SharePoint.
 * @param {number} ano
 * @param {Array<{rc,indiceR,descricao,certificado,loteCorrida,especificacao,pedidoCompra,dataRecebimento,nf,fornecedor,obra,qtd,pesoLitro,observacao}>} linhas
 * @returns {Promise<{ok:true, anexadas:number, de:string, ate:string}>}
 */
export async function appendLinhasCmr(ano, linhas) {
  if (!linhas?.length) return { ok: true, anexadas: 0 };
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!driveId) throw new Error("SHAREPOINT_DRIVE_ID não configurado");
  const token = await getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };

  const itemId = await acharItemCmr(ano, driveId, auth);
  const base = `${GRAPH}/drives/${driveId}/items/${itemId}/workbook`;

  // Sessão persistente (grava de verdade no arquivo).
  const sess = await fetch(`${base}/createSession`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ persistChanges: true }) });
  if (!sess.ok) throw new Error(`createSession HTTP ${sess.status}`);
  const sessionId = (await sess.json()).id;
  const H = { ...auth, "Content-Type": "application/json", "workbook-session-id": sessionId };

  try {
    const aba = await abaDeDados(base, ano, H);
    const enc = encodeURIComponent(aba);

    // Última linha usada → começa a anexar na próxima.
    const ur = await fetch(`${base}/worksheets('${enc}')/usedRange(valuesOnly=true)?$select=address`, { headers: H });
    if (!ur.ok) throw new Error(`usedRange HTTP ${ur.status}`);
    const addr = (await ur.json()).address || `'${aba}'!A1:N1`;
    const ultima = Number((addr.match(/:[A-Z]+(\d+)\s*$/) || [])[1]) || 1;
    const inicio = ultima + 1;
    const fim = ultima + linhas.length;

    // Monta as linhas em A..N (14 colunas), na ordem exata da planilha.
    const values = linhas.map((l) => ([
      so(l.rc) || (num(l.pesoLitro) ? "R" : num(l.qtd) ? "RC" : "R"),
      so(l.indiceR),
      so(l.descricao),
      so(l.certificado),
      so(l.loteCorrida),
      so(l.especificacao),
      so(l.pedidoCompra),
      l.dataRecebimento ? fmtDataBR(l.dataRecebimento) : "",
      so(l.nf),
      so(l.fornecedor),
      so(l.obra),
      num(l.qtd),
      num(l.pesoLitro),
      so(l.observacao),
    ]));

    const colFim = colLetra(14); // "N"
    // Endereço RELATIVO à aba (já escopada em worksheets('...')) — evita ter que
    // pôr aspas no nome numérico "2026".
    const rangeAddr = `A${inicio}:${colFim}${fim}`;
    const patch = await fetch(`${base}/worksheets('${enc}')/range(address='${encodeURIComponent(rangeAddr)}')`, {
      method: "PATCH", headers: H, body: JSON.stringify({ values }),
    });
    if (!patch.ok) {
      const t = await patch.text().catch(() => "");
      throw new Error(`PATCH range HTTP ${patch.status}: ${t.slice(0, 200)}`);
    }
    return { ok: true, anexadas: linhas.length, de: so(linhas[0].indiceR), ate: so(linhas[linhas.length - 1].indiceR), linha: inicio };
  } finally {
    await fetch(`${base}/closeSession`, { method: "POST", headers: H }).catch(() => {});
  }
}
