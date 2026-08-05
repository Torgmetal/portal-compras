// POST /api/qualidade/rnc/[id]/extrair  { anexoUrl, tipo }
// Extrai os dados do documento que o cliente enviou (PDF/imagem) e preenche os campos
// VAZIOS da RNC (não sobrescreve o que já foi digitado). A data vem do documento.
// É só EXTRAÇÃO — não cria plano, não faz 5 porquês, não opina.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
import { extrairRncCliente } from "@/lib/extrair-rnc-cliente";

export const runtime = "nodejs";
export const maxDuration = 120;

const limiter = createRateLimiter({ name: "rnc-extrair", maxRequests: 20, windowMs: 60_000 });
const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rl = limiter(req, `user:${user.id}`);
  if (!rl.ok) return NextResponse.json({ error: "Muitas extrações seguidas. Aguarde um instante." }, { status: 429 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "IA não configurada (ANTHROPIC_API_KEY)." }, { status: 500 });

  const rnc = await prisma.naoConformidade.findUnique({ where: { id: params.id } });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  const tipo = String(body.tipo || "").toLowerCase();
  const anexoUrl = String(body.anexoUrl || "");
  if (!TIPOS_OK.includes(tipo)) return NextResponse.json({ error: "Envie um PDF ou imagem (PNG/JPG/WEBP)." }, { status: 415 });
  if (!/^https?:\/\//.test(anexoUrl)) return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });

  let buf;
  try {
    const r = await fetch(anexoUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) { return NextResponse.json({ error: "Não consegui baixar o anexo: " + (e?.message || "erro") }, { status: 502 }); }
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Documento muito grande (máx 20MB)." }, { status: 413 });

  let a;
  try { a = await extrairRncCliente(buf, tipo); }
  catch (e) { return NextResponse.json({ error: "Falha ao extrair: " + (e?.message || "erro") }, { status: 502 }); }
  if (!a) return NextResponse.json({ error: "Não consegui ler o documento. Confira se é um PDF/imagem legível." }, { status: 422 });

  // Preenche só o que está VAZIO (não clobbera o que o usuário já digitou). A data vem
  // do documento (a RNC nasce com a data de criação, que aqui é substituída).
  const vazio = (v) => !(v && String(v).trim());
  const data = {};
  const preenchidos = [];
  const talvez = (campo, valor, atual) => { if (valor && vazio(atual)) { data[campo] = valor; preenchidos.push(campo); } };
  talvez("cliente", a.cliente, rnc.cliente);
  talvez("numeroCliente", a.numeroCliente, rnc.numeroCliente);
  talvez("programa", a.programa, rnc.programa);
  talvez("opNumero", a.opNumero, rnc.opNumero);
  talvez("desenhoProjetoMarca", a.desenhoProjetoMarca, rnc.desenhoProjetoMarca);
  talvez("descricao", a.descricao, rnc.descricao);
  talvez("causas", a.causas, rnc.causas);
  if (a.data) { data.data = new Date(a.data + "T12:00:00Z"); preenchidos.push("data"); }

  if (Object.keys(data).length) await prisma.naoConformidade.update({ where: { id: rnc.id }, data });
  return NextResponse.json({ success: true, extraido: a, preenchidos });
}
