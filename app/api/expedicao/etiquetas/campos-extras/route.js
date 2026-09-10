// Importa a planilha "Lista Equivalência de Marcas" do cliente — os campos que só o modelo de
// etiqueta dele pede (referência, TAG Petrobras, posição).
//
// GET  ?opId=xxx            → quantas marcas desta obra já têm os campos (a tela mostra o estado)
// POST { opId, rows[] }     → grava/atualiza UMA LINHA POR UNIDADE (marca repetida = mais unidades)
//
// ⚠ As `rows` chegam JÁ PARSEADAS pelo navegador, como no importador da LE
// (`app/api/producao/pecas/importar-le/route.js`): o arquivo não sobe, só a matriz de células, o
// que passa longe do limite de 4,5 MB de corpo da Vercel.
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseEquivalenciaMarcas } from "@/lib/parse-equivalencia-marcas";
import { salvarCamposExtras } from "@/lib/etiqueta-campos-extras";
import { log } from "@/lib/log";

const registro = log("api/expedicao/etiquetas/campos-extras");
const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "PCP", "PLANEJAMENTO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });

const erro400 = (msg) => NextResponse.json({ success: false, error: msg }, { status: 400 });

const buscarOp = (opId) =>
  prisma.oP.findUnique({ where: { id: String(opId) }, select: { id: true, numero: true } });

export async function GET(req) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return erro400("Informe a OP.");
  const op = await buscarOp(opId);
  if (!op) return NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 });

  // ⚠ conta MARCAS distintas, não linhas: a tela compara esse número com a lista de marcas, e uma
  // marca de 3 unidades tem 3 linhas aqui.
  const linhas = await prisma.etiquetaCampoExtra.groupBy({ by: ["marca"], where: { opNumero: op.numero } });
  return NextResponse.json({ success: true, opNumero: op.numero, total: linhas.length });
}

/** O que veio no corpo, ou a resposta de recusa pronta. */
async function receber(req) {
  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const rows = Array.isArray(corpo?.rows) ? corpo.rows : null;
  if (!corpo?.opId || !rows) return { recusa: erro400("Escolha a OP e envie a planilha.") };

  const op = await buscarOp(corpo.opId);
  if (!op) return { recusa: NextResponse.json({ success: false, error: "OP não encontrada" }, { status: 404 }) };

  let lido;
  try {
    // Remonta a planilha a partir das células para o parser ver o mesmo arquivo que o cliente mandou.
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    lido = parseEquivalenciaMarcas(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (e) {
    return { recusa: erro400("Não consegui ler a planilha: " + e.message) };
  }
  if (!lido.unidades.length) return { recusa: erro400("A planilha não trouxe nenhuma marca.") };
  return { op, lido };
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const { recusa, op, lido } = await receber(req);
  if (recusa) return recusa;

  let resultado;
  try {
    resultado = await salvarCamposExtras(prisma, op.numero, lido.unidades);
  } catch (e) {
    registro.erro("falha ao gravar:", e?.message);
    return NextResponse.json({ success: false, error: "Não consegui gravar: " + e.message }, { status: 500 });
  }

  // Registro obrigatório de mutação — e é o que responde "eu importei" quando a etiqueta sair sem TAG.
  await prisma.auditLog.create({
    data: {
      userId: user?.id || null, action: "IMPORTAR_CAMPOS_ETIQUETA", entity: "EtiquetaCampoExtra",
      entityId: op.id,
      diff: { opNumero: op.numero, linhas: lido.unidades.length, marcas: lido.marcas, ...resultado, ignoradas: lido.ignoradas },
    },
  }).catch(() => {});

  registro.info(`OP ${op.numero}: ${resultado.criados} nova(s), ${resultado.atualizados} atualizada(s)`);
  return NextResponse.json({ success: true, opNumero: op.numero, linhas: lido.unidades.length, marcas: lido.marcas, ...resultado });
}
