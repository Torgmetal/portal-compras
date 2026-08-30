// GET  /api/comercial/orcamento/abrir-pasta   → qual seria o próximo número
// POST /api/comercial/orcamento/abrir-pasta   { cliente, obra, numero?, criarOrcamento? }
//
// Faz pelo portal o que o Comercial faz à mão hoje. Vitor (30/08/2026): "hoje copiamos a pasta
// toda que te dei o caminho, pegamos a última que foi emitida para numerar, e começamos a
// preencher".
//
// ⚠⚠ O MODELO NÃO É TOCADO — Vitor: "para podermos editar sem você mexer no modelo padrão". A
// cópia LÊ a 000-26 e escreve num destino novo. Nada é movido, renomeado ou gravado nela.
//
// ⚠ E CRIA UMA PASTA DE VERDADE NO SHAREPOINT, consumindo um número de orçamento. Por isso é POST
// e nasce da tela — não de cron, não de rotina automática. Número de orçamento queimado num teste
// é um buraco na sequência que fica para sempre.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { proximoNumero, abrirPastaDoOrcamento, statusDaCopia } from "@/lib/orcamento-pasta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES = ["ADMIN", "COMERCIAL"];

/** Os números de orçamento do ano que o portal já conhece. */
const numerosDoBanco = (ano) => async () => {
  const aa = String(ano).slice(-2);
  const os = await prisma.orcamento.findMany({ where: { numero: { endsWith: `-${aa}` } }, select: { numero: true } });
  return os.map((o) => Number(String(o.numero).split("-")[0])).filter(Boolean);
};

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getFullYear();
  try {
    return NextResponse.json({ ano, ...(await proximoNumero(ano, numerosDoBanco(ano))) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const b = await req.json().catch(() => ({}));
  const ano = Number(b.ano) || new Date().getFullYear();
  const cliente = String(b.cliente || "").trim();
  if (!cliente) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  const obra = String(b.obra || "").trim();

  try {
    // ⚠ o número vem calculado na hora, não do que a tela mandou: entre abrir o formulário e
    // clicar, outra pessoa pode ter aberto um orçamento. O `numero` do corpo só é aceito quando
    // vem explícito — é o caso de criar a pasta que falta para um orçamento que já existe.
    const calc = await proximoNumero(ano, numerosDoBanco(ano));
    const numero = String(b.numero || "").trim() || calc.proximo;

    const pasta = await abrirPastaDoOrcamento({ numero, cliente, obra, ano });

    // o orçamento no portal, para a pasta não nascer órfã da Central
    let orcamento = await prisma.orcamento.findUnique({ where: { numero } });
    if (!orcamento && b.criarOrcamento !== false) {
      orcamento = await prisma.orcamento.create({
        data: { numero, cliente, obra: obra || null, status: "ORCAMENTO", criadoPorId: user.id },
      });
    }

    await prisma.auditLog.create({
      data: { userId: user.id, action: "ABRIR_PASTA_ORCAMENTO", entity: "Orcamento",
              entityId: numero, diff: { pasta: pasta.nome, caminho: pasta.caminho } },
    }).catch(() => {});

    return NextResponse.json({
      ok: true, numero, orcamentoId: orcamento?.id || null,
      pasta: pasta.nome, caminho: pasta.caminho,
      // a cópia é assíncrona: a tela mostra "copiando" enquanto o Graph termina
      copia: await statusDaCopia(pasta.monitor),
      monitor: pasta.monitor,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
