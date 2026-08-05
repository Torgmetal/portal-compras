// POST /api/qualidade/rnc/[id]/analisar  { base64, tipo, nome }
// Sobe o documento da RNC do cliente no Blob, analisa com o Claude (pontos, causas,
// 5 porquês) e JÁ preenche a RNC + cria o Plano de Ação 5W2H para não reincidir.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
import { analisarRncCliente } from "@/lib/analisar-rnc-cliente";
import { numRNC } from "@/lib/nao-conformidade";

export const runtime = "nodejs";
export const maxDuration = 120;

const limiter = createRateLimiter({ name: "rnc-analisar", maxRequests: 12, windowMs: 60_000 });
const TIPOS = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_B64 = 12 * 1024 * 1024;

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
  const b64 = String(body.base64 || "").includes(",") ? String(body.base64).split(",")[1] : String(body.base64 || "");
  if (!TIPOS[tipo]) return NextResponse.json({ error: "Envie o documento em PDF, JPG, PNG ou WEBP." }, { status: 415 });
  if (!b64) return NextResponse.json({ error: "Anexo vazio." }, { status: 400 });
  if (b64.length > MAX_B64) return NextResponse.json({ error: "Documento muito grande. Reduza ou divida o arquivo." }, { status: 413 });

  // 1) guarda o documento no Blob
  let anexoUrl = rnc.anexoUrl || null;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`qualidade/rnc/${numRNC(rnc.numero, rnc.ano).replace("/", "-")}.${TIPOS[tipo]}`, Buffer.from(b64, "base64"), { access: "public", addRandomSuffix: true, contentType: tipo });
      anexoUrl = blob.url;
    }
  } catch { /* segue sem guardar o anexo */ }

  // 2) analisa com a IA
  let a;
  try { a = await analisarRncCliente(b64, tipo); }
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
