// Importa a "Lista de Equivalência de TAG" do cliente — a TAG que sai na FRENTE DA DESCRIÇÃO na
// etiqueta Padrão Torg (Matheus, 14/09/2026).
//
// GET  ?opId=xxx                 → a cobertura da obra (quantas peças têm TAG, e o que falta)
// POST { opId, abas:[{nome,rows}] } → substitui o mapa de TAGs daquela OP
//
// ⚠ As abas chegam JÁ PARSEADAS pelo navegador, como no importador do QWS e da L.E.: o arquivo não
// sobe, só as matrizes de células, o que passa longe do limite de 4,5 MB de corpo da Vercel.
//
// ⚠⚠ É UMA ABA POR TAG, e as três precisam chegar. Mandando só a primeira, metade da obra ficaria
// sem destino e a outra metade com o destino errado — ver `lib/parse-equivalencia-tag.js`.
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseEquivalenciaTag } from "@/lib/parse-equivalencia-tag";
import { conferirCobertura, salvarTagsCliente, tagsDaOP } from "@/lib/etiqueta-tag-cliente";
import { itensExpediveisDaOP } from "@/lib/itens-expedicao";
import { log } from "@/lib/log";

const registro = log("api/expedicao/etiquetas/tags-cliente");
const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "PCP", "PLANEJAMENTO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
const erro400 = (msg) => NextResponse.json({ success: false, error: msg }, { status: 400 });

export async function GET(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }
  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return erro400("Informe a OP.");

  const dados = await itensExpediveisDaOP(prisma, String(opId));
  if (!dados) return NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 });

  const unidades = await tagsDaOP(prisma, dados.op.numero);
  if (!unidades.length) return NextResponse.json({ success: true, temMapa: false });

  const cobertura = conferirCobertura(unidades, dados.pecas);
  return NextResponse.json({
    success: true, temMapa: true, opNumero: dados.op.numero,
    tags: [...new Set(unidades.map((u) => u.tag))].sort(),
    ...cobertura,
  });
}

/** O que veio no corpo, já lido — ou a recusa pronta. */
async function receber(req) {
  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const abas = Array.isArray(corpo?.abas) ? corpo.abas : null;
  if (!corpo?.opId || !abas?.length) return { recusa: erro400("Escolha a OP e envie a planilha.") };

  const dados = await itensExpediveisDaOP(prisma, String(corpo.opId));
  if (!dados) return { recusa: NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 }) };

  let lido;
  try {
    // Remonta o arquivo a partir das células, para o parser ver a mesma planilha que o cliente mandou.
    const wb = XLSX.utils.book_new();
    for (const a of abas) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.rows || []), String(a.nome || "Sheet").slice(0, 31));
    }
    lido = parseEquivalenciaTag(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (e) {
    return { recusa: erro400("Não consegui ler a planilha: " + e.message) };
  }
  // ⚠⚠ ARQUIVO TORTO NÃO APAGA O MAPA ANTERIOR (pedido do Codex): a recusa vem ANTES de qualquer
  // escrita, senão uma planilha errada limparia as TAGs e não teria o que pôr no lugar.
  if (!lido.ok) return { recusa: erro400(lido.erro) };
  return { dados, lido };
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const { recusa, dados, lido } = await receber(req);
  if (recusa) return recusa;

  const cobertura = conferirCobertura(lido.unidades, dados.pecas);

  let resultado;
  try {
    resultado = await salvarTagsCliente(prisma, dados.op.numero, lido.unidades);
  } catch (e) {
    registro.erro("falha ao gravar:", e?.message);
    return NextResponse.json({ success: false, error: "Não consegui gravar: " + e.message }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userId: user?.id || null, action: "IMPORTAR_TAG_CLIENTE", entity: "EtiquetaCampoExtra",
      entityId: dados.op.id,
      diff: {
        opNumero: dados.op.numero, tags: lido.tags, abas: lido.abas, unidades: lido.unidades.length,
        ...resultado,
        semTag: cobertura.semTag.length, sobrando: cobertura.sobrando.length,
        foraDaLista: cobertura.foraDaLista.length, problemas: lido.problemas,
      },
    },
  }).catch(() => {});

  registro.info(`OP ${dados.op.numero}: ${resultado.gravadas} unidade(s), TAGs ${lido.tags.join(", ")}`);
  return NextResponse.json({
    success: true, opNumero: dados.op.numero, temMapa: true,
    tags: lido.tags, abas: lido.abas, problemas: lido.problemas, ...resultado, ...cobertura,
  });
}
