// POST /api/portal/{token}/eng-zip {ids:[...]} — o cliente baixa VÁRIOS documentos de uma vez.
//
// Vitor (26/08/2026): "crie uma caixa de seleção para que o cliente possa baixar mais de um arquivo
// de uma vez".
//
// ⚠⚠ A MESMA TRAVA DO DOWNLOAD DE UM. Cada id tem de estar na LISTA ESCOLHIDA daquela obra, e na
// Engenharia tem de ser um dos quatro tipos publicáveis. Um endpoint que aceitasse uma lista sem
// conferir seria a porta larga ao lado da porta trancada: bastaria mandar ids no corpo.
//
// ⚠ POST, não GET: 30 ids não cabem numa URL, e ninguém precisa de um link de ZIP compartilhável.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import PizZip from "pizzip";
import { getAccessToken } from "@/lib/sharepoint";
import { secoesDoPortal, tipoDoDocEng } from "@/lib/portal-cliente";
import { registrarAcesso } from "@/lib/portal-acesso";

export const runtime = "nodejs";
export const maxDuration = 120;
const GRAPH = "https://graph.microsoft.com/v1.0";

// ⚠⚠ TETO DE TAMANHO E DE QUANTIDADE. O ZIP é montado INTEIRO em memória (PizZip não faz stream) —
// diferente do volume do Data Book, que passa de 90 MB porque é repassado em stream. Uma seleção de
// 25 desenhos com o modelo 3D junto passa fácil de 200 MB: a função morre sem dizer por quê e o
// cliente vê só um download que falhou. Com o teto, ele lê o motivo e baixa em duas levas.
const TETO_BYTES = 60 * 1024 * 1024;
const TETO_ARQUIVOS = 60;

export async function POST(req, { params }) {
  const { token } = await params;
  const { ids } = await req.json().catch(() => ({}));
  const pedidos = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, TETO_ARQUIVOS + 1);
  if (!pedidos.length) return NextResponse.json({ error: "Nenhum arquivo selecionado." }, { status: 400 });
  if (pedidos.length > TETO_ARQUIVOS) {
    return NextResponse.json({ error: `Selecione até ${TETO_ARQUIVOS} arquivos por vez.` }, { status: 400 });
  }

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (!secoesDoPortal(portal).includes("DOCUMENTOS")) {
    return NextResponse.json({ error: "Estes documentos não fazem parte do portal desta obra." }, { status: 403 });
  }

  const mapa = portal.docsPorArea || (portal.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
  const porId = new Map();
  for (const [area, lista] of Object.entries(mapa || {})) {
    for (const d of Array.isArray(lista) ? lista : []) {
      // a trava dos quatro tipos vale aqui como vale no download de um só
      if (area === "ENGENHARIA" && !tipoDoDocEng(d)) continue;
      porId.set(String(d.id), { ...d, area });
    }
  }
  const docs = pedidos.map((id) => porId.get(id)).filter(Boolean);
  if (!docs.length) return NextResponse.json({ error: "Nenhum dos arquivos pedidos está publicado nesta obra." }, { status: 404 });

  const previsto = docs.reduce((s, d) => s + (Number(d.tamanho) || 0), 0);
  if (previsto > TETO_BYTES) {
    return NextResponse.json({
      error: `A seleção tem ${(previsto / 1048576).toFixed(0)} MB e o limite por download é ${TETO_BYTES / 1048576} MB. Marque menos arquivos e baixe em duas partes.`,
    }, { status: 413 });
  }

  const auth = { Authorization: `Bearer ${await getAccessToken()}` };
  const zip = new PizZip();
  const usados = new Set();
  const falhas = [];
  let total = 0;

  for (const d of docs) {
    try {
      const r = await fetch(`${GRAPH}/drives/${process.env.SHAREPOINT_DRIVE_ID}/items/${encodeURIComponent(d.id)}/content`, { headers: auth, redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      total += buf.length;
      // ⚠ o ZIP estoura o teto pelo tamanho REAL, não pelo previsto: o que o cadastro guarda pode
      // estar desatualizado se o arquivo foi trocado na pasta.
      if (total > TETO_BYTES) { falhas.push(`${d.nome} (limite de tamanho)`); break; }

      // ⚠ O NOME DENTRO DO ZIP É O QUE O CLIENTE LÊ, com a extensão do arquivo de verdade — o nome
      // de exibição ("Memorial de Cálculo") não tem extensão, e um zip cheio de arquivos sem
      // extensão não abre em nada.
      const ext = (String(d.nome).match(/\.[A-Za-z0-9]{1,6}$/) || [""])[0];
      const base = String(d.nomeExibicao || d.nome).replace(/\.[A-Za-z0-9]{1,6}$/, "").replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
      let nome = `${base}${ext}`;
      let n = 2;
      while (usados.has(nome.toLowerCase())) nome = `${base} (${n++})${ext}`;
      usados.add(nome.toLowerCase());
      zip.file(nome, buf);
    } catch (e) {
      falhas.push(`${d.nomeExibicao || d.nome} (${e?.message || "erro"})`);
    }
  }

  if (!usados.size) {
    return NextResponse.json({ error: `Não consegui baixar os arquivos: ${falhas.slice(0, 3).join(", ")}` }, { status: 502 });
  }

  // ⚠ STORE, sem compressão: PDF, DWG e IFC já vêm comprimidos — recomprimir gastaria segundos de
  // CPU para economizar quase nada, e é justamente onde a função estoura o tempo.
  const bytes = zip.generate({ type: "nodebuffer", compression: "STORE" });

  await prisma.portalCliente.update({ where: { id: portal.id }, data: { ultimoAcessoEm: new Date() } }).catch(() => {});
  await registrarAcesso(req, {
    portal, codigo: new URL(req.url).searchParams.get("d"), evento: "DOWNLOAD",
    documento: `${usados.size} arquivo(s) em ZIP`, secao: docs[0]?.area || null,
  });

  const nomeZip = `OP-${portal.opNumero} - documentos.zip`;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeZip)}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(bytes.length),
      ...(falhas.length ? { "X-Falhas": String(falhas.length) } : {}),
    },
  });
}
