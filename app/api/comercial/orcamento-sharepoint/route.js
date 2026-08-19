// PASTA DO COMERCIAL — busca o orçamento e devolve os documentos dele (proposta e estudo),
// pra vincular já na criação da OP. Vitor (19/08): "o campo para importar isso deve aparecer logo
// quando clicamos no botão de criarmos as OPs".
//
// A estrutura é sempre a mesma e é o que torna isso possível:
//   Comercial/1. Orçamento/ORÇAMENTOS_<ano>/{1. Solicitados|2. Concluidos}/<nnn-aa-CLIENTE-OBRA>/
//     1.Emails · 2.Projetos · 3.Documentos · 4.Cotações · 5.Estudos · 6.Propostas · 7.Confidencialidade
//
// GET ?q=danpower            → orçamentos que casam com a busca
// GET ?pasta=<caminho>       → arquivos de 5.Estudos e 6.Propostas daquele orçamento
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const GRAPH = "https://graph.microsoft.com/v1.0";
const RAIZ = "/Comercial/1. Orçamento";
// Solicitados vem primeiro: OP nova costuma nascer de orçamento recém-aprovado.
const FASES = ["1. Solicitados", "2. Concluidos", "1.Solicitados", "2.Concluídos"];

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function filhos(token, driveId, caminho, select = "id,name,folder,file,size,lastModifiedDateTime") {
  const r = await fetch(`${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$select=${select}&$top=400`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const { value = [] } = await r.json();
  return value;
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;

  // ── 2) documentos de um orçamento ────────────────────────────────────────────────────────
  const pasta = sp.get("pasta");
  if (pasta) {
    if (!pasta.startsWith(RAIZ)) return NextResponse.json({ error: "Pasta fora do Comercial." }, { status: 400 });
    const arquivos = async (sub) => (await filhos(token, driveId, `${pasta}/${sub}`))
      .filter((x) => x.file && !/^~\$/.test(x.name))
      .map((x) => ({ id: x.id, nome: x.name, tamanho: x.size, em: x.lastModifiedDateTime, sub }))
      .sort((a, b) => String(b.em).localeCompare(String(a.em)));

    const estudos = await arquivos("5.Estudos");
    const propostas = await arquivos("6.Propostas");
    // sugestão automática: o estudo é o LQC/EPC mais recente; a proposta, o PTC mais recente
    const sugestao = {
      estudo: estudos.find((f) => /^(lqc|epc)-/i.test(f.nome) && /\.xls/i.test(f.nome))?.id || null,
      ptc: propostas.find((f) => /^ptc-/i.test(f.nome) && /\.pdf$/i.test(f.nome))?.id || null,
      tecnica: propostas.find((f) => /^(pt|prop.*tec)-/i.test(f.nome))?.id || null,
      comercial: propostas.find((f) => /^(pc|prop.*com)-/i.test(f.nome))?.id || null,
    };
    return NextResponse.json({ pasta, estudos, propostas, sugestao });
  }

  // ── 1) busca de orçamentos ───────────────────────────────────────────────────────────────
  const q = norm(sp.get("q") || "");
  const anoPedido = sp.get("ano");
  const anos = (await filhos(token, driveId, RAIZ))
    .filter((x) => x.folder && /^OR[ÇC]AMENTOS[_ ]\d{4}$/i.test(x.name))
    .map((x) => x.name)
    .sort()
    .reverse();
  const alvos = anoPedido ? anos.filter((a) => a.includes(anoPedido)) : anos.slice(0, 2); // ano atual + anterior

  const achados = [];
  for (const ano of alvos) {
    for (const fase of FASES) {
      const dirs = (await filhos(token, driveId, `${RAIZ}/${ano}/${fase}`, "name,folder")).filter((x) => x.folder);
      for (const d of dirs) {
        if (q && !norm(d.name).includes(q)) continue;
        achados.push({ nome: d.name, ano, fase, caminho: `${RAIZ}/${ano}/${fase}/${d.name}` });
      }
      if (dirs.length) break; // a fase existe com um nome só; não repete a busca nas variantes
    }
  }
  // mais recentes primeiro (o nome começa com o número do orçamento)
  achados.sort((a, b) => b.nome.localeCompare(a.nome, "pt-BR", { numeric: true }));
  return NextResponse.json({ anos, orcamentos: achados.slice(0, 60), total: achados.length });
}
