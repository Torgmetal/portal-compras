// GET  /api/portal/engenharia-docs?opNumero=&area=&caminho=  → navega a pasta da OP no servidor
// POST /api/portal/engenharia-docs {opNumero, area, docs}     → grava a SELEÇÃO daquela área
//
// Vitor (26/08/2026): "para cada parte aqui me permita acessar o servidor e selecionar o que eu
// quero colocar, e me dê a opção de podermos renomear os arquivos para que o cliente veja um nome
// mais adequado do que o nome original do documento".
//
// ⚠⚠ NAVEGA A PASTA DA OP INTEIRA, uma pasta por vez. Antes varria só a 2.5.5 e devolvia tudo de
// uma vez — servia para a Engenharia e não servia para as outras áreas, cujos documentos moram em
// 8. Qualidade, 4. Expedição, 3. Compras. E varrer a OP inteira de uma vez seria lento e inútil:
// ninguém escolhe entre 2.000 arquivos numa lista.
//
// ⚠ NADA É PUBLICADO SOZINHO — a pasta tem revisão obsoleta e arquivo de trabalho. Escolher
// continua obrigatório; o que a tela faz é baratear o esforço.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { acharPastaOp, getAccessToken } from "@/lib/sharepoint";
import { AREA } from "@/lib/portal-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.microsoft.com/v1.0";
const ROLES = ["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO", "ENGENHARIA"];
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
const so = (v) => (v === null || v === undefined ? "" : String(v).trim());

// ⚠ ONDE CADA ÁREA COMEÇA. Não é trava — dá para subir e navegar a OP toda; é só o ponto de
// partida, para não obrigar a pessoa a achar a pasta certa toda vez.
const RAIZ_DA_AREA = {
  ENGENHARIA: "2. Engenharia/2.5 Projetos",
  COMPRAS: "3. Compras",
  PLANEJAMENTO: "5. Planejamento",
  QUALIDADE: "8. Qualidade",
  EXPEDICAO: "4. Expedição",
};

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const opNumero = so(u.searchParams.get("opNumero")).replace(/\D/g, "").padStart(3, "0");
  const area = so(u.searchParams.get("area")).toUpperCase() || "ENGENHARIA";
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  if (!AREA[area]) return NextResponse.json({ error: "Área desconhecida." }, { status: 400 });

  const base = await acharPastaOp(opNumero);
  if (!base) return NextResponse.json({ error: "Pasta da OP não encontrada no SharePoint.", pastas: [], arquivos: [] });

  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const listar = async (path) => {
    const r = await fetch(`${GRAPH}/drives/${drive}/root:/${enc(path)}:/children?$select=id,name,size,file,folder,lastModifiedDateTime&$top=999&$orderby=name`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return (await r.json()).value || [];
  };

  // ⚠ o caminho vem RELATIVO à pasta da OP e é saneado: sem isso, um "../.." na barra de endereço
  // navegaria o servidor inteiro a partir de uma tela do portal.
  const pedido = so(u.searchParams.get("caminho")).replace(/^\/+|\/+$/g, "");
  const rel = pedido.split("/").filter((x) => x && x !== "." && x !== "..").join("/");
  const inicial = RAIZ_DA_AREA[area] || "";
  const atual = pedido === "" && !u.searchParams.has("caminho") ? inicial : rel;

  let itens = await listar(atual ? `${base}/${atual}` : base);
  let aviso = null;
  if (itens === null) {
    // ⚠ pasta padrão que não existe nesta obra não é erro: cai na raiz da OP e diz por quê.
    aviso = `A obra não tem a pasta "${atual}" — mostrando a raiz da OP.`;
    itens = (await listar(base)) || [];
    return devolver({ base, atual: "", itens, opNumero, area, aviso });
  }
  return devolver({ base, atual, itens, opNumero, area, aviso });
}

async function devolver({ base, atual, itens, opNumero, area, aviso }) {
  const portal = await prisma.portalCliente.findUnique({ where: { opNumero }, select: { docsPorArea: true, docsEngenharia: true } });
  const mapa = portal?.docsPorArea || (portal?.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
  const escolhidos = Array.isArray(mapa?.[area]) ? mapa[area] : [];
  const porId = new Map(escolhidos.map((d) => [String(d.id), d]));

  return NextResponse.json({
    raizOp: base, caminho: atual, caminhoCompleto: atual ? `${base}/${atual}` : base, aviso,
    pastas: itens.filter((x) => x.folder).map((x) => ({ nome: x.name, itens: x.folder?.childCount ?? null })),
    arquivos: itens.filter((x) => !x.folder).map((x) => ({
      id: x.id, nome: x.name, tamanho: x.size || 0, em: x.lastModifiedDateTime || null,
      escolhido: porId.has(x.id), nomeExibicao: porId.get(x.id)?.nomeExibicao || null,
    })),
    // a seleção INTEIRA da área vai junto: a tela mostra o que já está publicado mesmo estando
    // noutra pasta, senão a pessoa acha que perdeu o que escolheu ontem.
    selecionados: escolhidos,
  });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opNumero: raw, area: rawArea, docs } = await req.json().catch(() => ({}));
  const opNumero = so(raw).replace(/\D/g, "").padStart(3, "0");
  const area = so(rawArea).toUpperCase() || "ENGENHARIA";
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  if (!AREA[area]) return NextResponse.json({ error: "Área desconhecida." }, { status: 400 });
  if (!Array.isArray(docs)) return NextResponse.json({ error: "Envie a lista de documentos." }, { status: 400 });

  // ⚠ guarda id, nome do arquivo, NOME DE EXIBIÇÃO e pasta. O nome de exibição é o que o cliente
  // lê; o nome do arquivo fica para quem for procurá-lo no servidor depois — os dois precisam
  // conviver, senão ninguém acha o original quando o cliente pergunta sobre "Projeto de montagem".
  const limpo = docs.slice(0, 300)
    .filter((d) => d?.id && d?.nome)
    .map((d) => ({
      id: String(d.id), nome: so(d.nome).slice(0, 200),
      nomeExibicao: so(d.nomeExibicao).slice(0, 160) || null,
      pasta: so(d.pasta).slice(0, 200), tamanho: Number(d.tamanho) || 0, em: d.em || null,
    }));

  // ⚠⚠ LPC/LE CRUA NÃO SE PUBLICA COM O PESO FECHADO. Vitor (26/08/2026): "as planilhas que estamos
  // conseguindo baixar não estão na formatação da Torg (…) a LPC precisa estar na aba da
  // Engenharia, a que está lá foi a que anexei da pasta e ela não está no nosso template, tanto que
  // não vamos fornecer pesos por hora".
  //
  // O portal JÁ publica a LPC e a LE geradas no servidor, no template Torg, e a coluna de PESO
  // simplesmente não existe no arquivo quando a obra não liberou (Vitor, 22/08: "peso é preço").
  // Publicar o xlsx da pasta por cima disso passa por fora da regra inteira — o arquivo original
  // tem o peso item a item, e o que o cliente já baixou não tem volta.
  const atual = await prisma.portalCliente.findUnique({ where: { opNumero }, select: { docsPorArea: true, docsEngenharia: true, mostrarPeso: true } });
  const RX_LISTA = /(^|[^A-Z])(LPC|LE)([^A-Z]|$)|lista de (pe[çc]a|produ|expedi)/i;
  const crua = limpo.filter((d) => /\.xls[xm]?$/i.test(d.nome) && RX_LISTA.test(d.nome));
  if (crua.length && atual?.mostrarPeso !== true) {
    return NextResponse.json({
      error: `${crua.length} arquivo(s) parecem ser a LPC/LE original da Engenharia (${crua.slice(0, 3).map((d) => d.nome).join(", ")}). O portal já publica essas listas no template Torg e SEM peso — o arquivo da pasta traz o peso item a item. Use a seção "Lista de peças (LPC)" do portal, ou ligue "divulgar o peso" se a obra realmente permite.`,
      listaCrua: true, arquivos: crua.map((d) => d.nome),
    }, { status: 409 });
  }
  const mapa = { ...(atual?.docsPorArea || (atual?.docsEngenharia ? { ENGENHARIA: atual.docsEngenharia } : {})) };
  mapa[area] = limpo;

  await prisma.portalCliente.upsert({
    where: { opNumero },
    create: { opNumero, docsPorArea: mapa, criadoPorId: user?.id || null },
    update: { docsPorArea: mapa },
  });
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PORTAL_DOCS_AREA", entity: "PortalCliente", entityId: opNumero,
      diff: { op: opNumero, area, documentos: limpo.length, nomes: limpo.slice(0, 20).map((d) => d.nomeExibicao || d.nome) } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, area, escolhidos: limpo.length });
}
