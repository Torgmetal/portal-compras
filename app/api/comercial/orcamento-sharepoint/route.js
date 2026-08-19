// PASTA DO COMERCIAL — busca o orçamento e devolve os documentos dele (proposta e estudo),
// pra vincular já na criação da OP. Vitor (19/08): "o campo para importar isso deve aparecer logo
// quando clicamos no botão de criarmos as OPs".
//
// A estrutura é sempre a mesma e é o que torna isso possível:
//   Comercial/1. Orçamento/ORÇAMENTOS_<ano>/{1. Solicitados|2. Concluidos}/<nnn-aa-CLIENTE-OBRA>/
//     1.Emails · 2.Projetos · 3.Documentos · 4.Cotações · 5.Estudos · 6.Propostas · 7.Confidencialidade
//
// NAVEGAÇÃO PASTA A PASTA, igual à dos Documentos do SGQ (Vitor 19/08: "quero que deixe igual ao
// da qualidade"). Mesma API: `?path=<subpasta>` devolve o conteúdo daquela pasta, e a tela monta
// a trilha. A primeira tentativa foi um buscador com sugestão automática — o Vitor achou
// bagunçado, e ele tem razão: navegar a pasta é o que o time já sabe fazer.
//
// GET ?path=<subpasta relativa à raiz>   → { itens: [{tipo, nome, id, webUrl, modificado…}] }
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const GRAPH = "https://graph.microsoft.com/v1.0";
// Caminho confirmado pelo Vitor (19/08), na biblioteca SERVIDOR do site TorgMetal:
//   .../sites/TorgMetal/SERVIDOR/Comercial/1. Orçamento/ORÇAMENTOS_2026
// Aqui é relativo à raiz do drive (SHAREPOINT_DRIVE_ID já aponta pra SERVIDOR).
const RAIZ = process.env.SHAREPOINT_ORCAMENTOS_BASE || "/Comercial/1. Orçamento";
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
  const sub = (sp.get("path") || "").replace(/^\/+|\/+$/g, "");
  // trava de diretório: nada de subir a árvore
  if (sub.split("/").some((s) => s === "..")) return NextResponse.json({ error: "caminho inválido" }, { status: 400 });

  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const caminho = sub ? `${RAIZ}/${sub}` : RAIZ;

  const r = await fetch(
    `${GRAPH}/drives/${driveId}/root:${encodeURI(caminho)}:/children?$select=id,name,folder,file,size,lastModifiedDateTime,webUrl&$top=999`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) return NextResponse.json({ path: sub, itens: [], erro: `pasta não acessível (${r.status})` });
  const { value = [] } = await r.json();

  const itens = value
    .filter((it) => !/^~\$/.test(it.name))
    .map((it) => ({
      id: it.id,
      nome: it.name,
      tipo: it.folder ? "folder" : "file",
      filhos: it.folder?.childCount ?? null,
      tamanho: it.size ?? null,
      modificado: it.lastModifiedDateTime || null,
      webUrl: it.webUrl || null,
    }))
    // pastas primeiro; dentro de cada grupo, ordem natural (ORÇAMENTOS_2026 antes de _2025 vem do
    // reverse abaixo só na raiz, onde o mais novo interessa primeiro)
    .sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) : a.tipo === "folder" ? -1 : 1));
  if (!sub) itens.reverse();

  return NextResponse.json({ path: sub, caminho, itens });
}
