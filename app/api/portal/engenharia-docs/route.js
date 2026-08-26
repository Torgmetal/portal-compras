// GET  /api/portal/engenharia-docs?opNumero=…  → o que existe na 2.5.5 da obra, para escolher
// POST /api/portal/engenharia-docs {opNumero, docs}  → grava a SELEÇÃO que vai ao portal
//
// Vitor (26/08/2026): "na Engenharia preciso que vincule a pasta 2.5.5, lá vamos trazer vários
// documentos, porém eu preciso selecionar esses documentos — não sai puxando sozinho".
//
// ⚠⚠ A PASTA 2.5.5 É A DE ENVIO AO CLIENTE — aqui ela é a fonte CERTA, ao contrário do que vale na
// fabricação (onde desenho ali não conta, porque a bancada não abre essa pasta). Mesma pasta, dois
// significados opostos, e cada tela usa o seu.
//
// ⚠ E NADA É PUBLICADO SOZINHO. A pasta tem revisão antiga, arquivo de trabalho e material que
// ainda não foi liberado. Varrer e publicar é vazar por descuido — e no portal do cliente não tem
// desfazer: o que ele já baixou, baixou.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { acharPastaOp, getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0";
const ROLES = ["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO", "ENGENHARIA"];
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

// ⚠ o nome varia entre obras ("2.5.5 Cliente", "2.5.5 Cliente (ENC 326)") — casa pelo prefixo,
// como no resto do portal. Casar o nome exato deixaria obra de fora sem dizer por quê.
const RX_CLIENTE = /^2\.5\.5/;

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(new URL(req.url).searchParams.get("opNumero") || "").replace(/\D/g, "").padStart(3, "0");
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const base = await acharPastaOp(opNumero);
  if (!base) return NextResponse.json({ error: "Pasta da OP não encontrada no SharePoint.", arquivos: [] }, { status: 200 });

  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const listar = async (path) => {
    const r = await fetch(`${GRAPH}/drives/${drive}/root:/${enc(path)}:/children?$select=id,name,size,file,folder,lastModifiedDateTime&$top=999`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? (await r.json()).value || [] : [];
  };

  const proj = `${base}/2. Engenharia/2.5 Projetos`;
  const sub = (await listar(proj)).find((x) => x.folder && RX_CLIENTE.test(x.name));
  if (!sub) return NextResponse.json({ error: "Esta obra não tem a pasta 2.5.5 (envio ao cliente).", arquivos: [] });

  // ⚠ desce um nível: a 2.5.5 costuma ter subpastas por assunto, e o documento que o cliente
  // recebe raramente está solto na raiz.
  const raiz = `${proj}/${sub.name}`;
  const out = [];
  const varre = async (path, prefixo, prof) => {
    for (const it of await listar(path)) {
      if (it.folder) { if (prof < 2) await varre(`${path}/${it.name}`, prefixo ? `${prefixo} / ${it.name}` : it.name, prof + 1); }
      else out.push({ id: it.id, nome: it.name, pasta: prefixo || "(raiz)", tamanho: it.size || 0, em: it.lastModifiedDateTime || null });
    }
  };
  await varre(raiz, "", 0);
  out.sort((a, b) => a.pasta.localeCompare(b.pasta, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

  const portal = await prisma.portalCliente.findUnique({ where: { opNumero }, select: { docsEngenharia: true } });
  const escolhidos = new Set((Array.isArray(portal?.docsEngenharia) ? portal.docsEngenharia : []).map((d) => d.id));

  return NextResponse.json({
    pasta: sub.name,
    arquivos: out.map((a) => ({ ...a, escolhido: escolhidos.has(a.id) })),
    total: out.length, escolhidos: escolhidos.size,
  });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opNumero: raw, docs } = await req.json().catch(() => ({}));
  const opNumero = String(raw || "").replace(/\D/g, "").padStart(3, "0");
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  if (!Array.isArray(docs)) return NextResponse.json({ error: "Envie a lista de documentos." }, { status: 400 });

  // ⚠ guarda id, NOME e pasta: o portal do cliente não pode depender de uma ida ao SharePoint só
  // para saber como se chama o arquivo — e se o arquivo for renomeado lá, o que o cliente viu
  // continua registrado aqui.
  const limpo = docs.slice(0, 200)
    .filter((d) => d?.id && d?.nome)
    .map((d) => ({ id: String(d.id), nome: String(d.nome).slice(0, 200), pasta: String(d.pasta || "").slice(0, 120), tamanho: Number(d.tamanho) || 0, em: d.em || null }));

  await prisma.portalCliente.upsert({
    where: { opNumero },
    create: { opNumero, docsEngenharia: limpo, criadoPorId: user?.id || null },
    update: { docsEngenharia: limpo },
  });
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PORTAL_DOCS_ENGENHARIA", entity: "PortalCliente", entityId: opNumero,
      diff: { op: opNumero, documentos: limpo.length, nomes: limpo.slice(0, 20).map((d) => d.nome) } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, escolhidos: limpo.length });
}
