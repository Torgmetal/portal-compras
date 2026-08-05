// POST /api/qualidade/rnc/[id]/analisar  { anexoUrl, tipo }
// O documento da RNC do cliente é subido DIRETO pro Blob pelo cliente (upload por
// token — evita o limite de ~4,5MB do corpo da rota). Aqui recebemos só a URL,
// baixamos, analisamos com o Claude (pontos, causas, 5 porquês) e JÁ preenchemos a
// RNC + criamos o Plano de Ação 5W2H para não reincidir.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
import { analisarRncCliente } from "@/lib/analisar-rnc-cliente";
import { numRNC } from "@/lib/nao-conformidade";

export const runtime = "nodejs";
export const maxDuration = 120;

const limiter = createRateLimiter({ name: "rnc-analisar", maxRequests: 12, windowMs: 60_000 });
const TIPOS = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rl = limiter(req, `user:${user.id}`);
  if (!rl.ok) return NextResponse.json({ error: "Muitas análises seguidas. Aguarde um instante." }, { status: 429 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "IA não configurada (ANTHROPIC_API_KEY)." }, { status: 500 });

  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id } });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  const tipo = String(body.tipo || "").toLowerCase();
  const anexoUrl = String(body.anexoUrl || "");
  if (!TIPOS[tipo]) return NextResponse.json({ error: "Envie o documento em PDF, JPG, PNG ou WEBP." }, { status: 415 });
  if (!/^https?:\/\//.test(anexoUrl)) return NextResponse.json({ error: "Anexo inválido — refaça o upload." }, { status: 400 });

  // 1) baixa o documento do Blob (o cliente já subiu direto por token — o arquivo
  // pesado não passa pelo corpo da rota; evita o limite de ~4,5MB).
  let buf;
  try {
    const r = await fetch(anexoUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) { return NextResponse.json({ error: "Não consegui baixar o anexo do storage: " + (e?.message || "erro") }, { status: 502 }); }
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Documento muito grande (máx 20MB). Reduza ou divida o arquivo." }, { status: 413 });

  // 2) analisa com a IA
  let a;
  try { a = await analisarRncCliente(buf, tipo); }
  catch (e) { return NextResponse.json({ error: "Falha na análise por IA: " + (e?.message || "erro") }, { status: 502 }); }
  if (!a) return NextResponse.json({ error: "Não consegui ler o documento. Confira se é um PDF/imagem legível." }, { status: 422 });

  // 3) preenche a RNC (identificação só se estiver vazia; análise sobrescreve)
  const orNull = (atual, novo) => (atual && atual.trim() ? atual : novo || null);
  const cinco = a.cincoPorques.map((r, i) => ({ porque: `${i + 1}º porquê`, resposta: r }));
  const data = {
    tipo: "CLIENTE", origem: rnc.origem || "CLIENTE", anexoUrl,
    cliente: orNull(rnc.cliente, a.cliente), numeroCliente: orNull(rnc.numeroCliente, a.numeroCliente),
    programa: orNull(rnc.programa, a.programa), opNumero: orNull(rnc.opNumero, a.opNumero),
    desenhoProjetoMarca: orNull(rnc.desenhoProjetoMarca, a.desenhoProjetoMarca),
    descricao: a.descricao || rnc.descricao, causas: a.causas || rnc.causas,
    cincoPorques: cinco.length ? cinco : rnc.cincoPorques,
    necessitaAcao: rnc.necessitaAcao || "CORRETIVA",
  };

  // 4) plano de ação 5W2H (cria com o nº da RNC, ou atualiza o existente)
  const pa = a.planoAcao || {};
  const item = {
    oque: pa.oque || "", porque: pa.porque || "", onde: pa.onde || "", quem: pa.quem || "",
    quando: "", como: pa.como || "", quanto: pa.quanto || "", status: "A_FAZER",
    acompanhamento: pa.prazo ? `Prazo sugerido pela IA: ${pa.prazo}` : "",
  };
  const titulo = `${numRNC(rnc.numero, rnc.ano)} — ${(a.descricao || "Não conformidade do cliente").slice(0, 70)}`;
  if (rnc.planoAcaoId) {
    await prisma.planoAcao.update({ where: { id: rnc.planoAcaoId }, data: { titulo, itens: [item] } }).catch(() => {});
  } else {
    const plano = await prisma.planoAcao.create({
      data: { numero: rnc.numero, titulo, origem: numRNC(rnc.numero, rnc.ano), responsavel: pa.quem || null, status: "EM_ANDAMENTO", itens: [item], createdById: user.id },
      select: { id: true },
    }).catch(() => null);
    if (plano) data.planoAcaoId = plano.id;
  }

  await prisma.naoConformidade.update({ where: { id: rnc.id }, data });
  return NextResponse.json({ success: true, analise: a });
}
