// Estudos de fabricação (a LQC dentro do portal) — lista e criação.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const PERFIS = ["ADMIN", "COMERCIAL"];

export async function GET(req) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || undefined;
  const estudos = await prisma.estudoFabricacao.findMany({
    where: ano ? { ano } : undefined,
    orderBy: [{ ano: "desc" }, { numero: "desc" }],
    select: { id: true, numero: true, ano: true, revisao: true, cliente: true, obra: true, status: true,
              resultado: true, criadoPorNome: true, updatedAt: true, orcamentoId: true,
              // o orçamento vem junto: é ele que dá o número da proposta e o valor que foi ao cliente
              orcamento: { select: { numero: true, cliente: true, obra: true, valor: true, status: true } } },
    take: 300,
  });
  return NextResponse.json({ estudos });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const b = await req.json().catch(() => ({}));
  const cliente = String(b.cliente || "").trim();
  if (!cliente) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });

  const ano = Number(b.ano) || new Date().getFullYear();

  // ⚠⚠ O NÚMERO DA LQC É O NÚMERO DO ORÇAMENTO. Descoberto ao ler as 93 LQCs do SharePoint
  // (29/08/2026): elas se chamam `LQC-283-26-BERMER-AENA-TORG-R00` — 283-26 é o orçamento. O
  // portal vinha gerando uma sequência própria (LQC-001, 002, 003, 004) que não correspondia a
  // orçamento nenhum, então a mesma proposta tinha dois números diferentes: um no Excel do
  // Comercial e outro aqui. Amarrado ao orçamento, o número passa a ser o mesmo dos dois lados.
  //
  // ⚠ Sem orçamento vinculado ainda existe sequencial — proposta pode nascer antes do cadastro —
  // mas ele começa DEPOIS do maior número do ano, para não colidir com um orçamento futuro.
  let numero = null;
  if (b.orcamentoId) {
    const orc = await prisma.orcamento.findUnique({ where: { id: b.orcamentoId }, select: { numero: true } });
    const n = Number(String(orc?.numero || "").split("-")[0]);
    if (Number.isFinite(n) && n > 0) numero = n;
  }
  if (!numero) {
    // ⚠⚠ O SEQUENCIAL SOLTO TEM DE PULAR OS ORÇAMENTOS TAMBÉM. O comentário acima já dizia que ele
    // começa "depois do maior número do ano, para não colidir com um orçamento futuro" — mas a
    // conta só olhava os ESTUDOS. Resultado real (01/09/2026): o último LQC era 291, o novo saiu
    // 292, e já existia o orçamento 292-26 de outro cliente. Ficaram LQC-292-26 (Suzuki/Geoprime) e
    // orçamento 292-26 (TESTE) com o mesmo número, sendo propostas diferentes — que é exatamente o
    // conflito que o Vitor viu na tela.
    //
    // ⚠ Os dois números do ano entram na conta: o do estudo e o do orçamento. São a MESMA série aos
    // olhos do Comercial (LQC-283-26 é a proposta 283-26), então não podem ter contadores separados.
    const sufixo = `-${String(ano).slice(-2)}`;
    const [ultimoEstudo, orcamentosDoAno] = await Promise.all([
      prisma.estudoFabricacao.findFirst({ where: { ano }, orderBy: { numero: "desc" }, select: { numero: true } }),
      prisma.orcamento.findMany({ where: { numero: { endsWith: sufixo } }, select: { numero: true } }),
    ]);
    const maiorOrc = orcamentosDoAno.reduce((m, o) => {
      const n = Number(String(o.numero || "").split("-")[0]);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    numero = Math.max(ultimoEstudo?.numero || 0, maiorOrc) + 1;
  }

  // ── AS DUAS PORTAS DÃO NO MESMO REGISTRO ────────────────────────────────────────────────────
  // Vitor (01/09/2026): "dentro do workspace tem 02 lugares para criar uma nova proposta e os dois
  // não se atualizam. Precisamos que ajuste isso para não ter esse conflito".
  //
  // ⚠⚠ ESTUDO SEM ORÇAMENTO AGORA CRIA O ORÇAMENTO. Pular o número do orçamento no sequencial (a
  // conta acima) só ADIA a colisão: o estudo solto reserva o 293 e o próximo orçamento cadastrado
  // também vai querer o 293. Enquanto o número existir de um lado só, as duas séries voltam a se
  // cruzar. Criando o orçamento junto, a proposta passa a ser UM registro com UM número, e aparece
  // nas duas telas na mesma hora.
  //
  // ⚠ ISSO NÃO DUPLICA COM A PLANILHA: a importação do SharePoint casa por `numero` e ATUALIZA o
  // que já existe (nunca cria em cima). Quando o Comercial lançar a mesma proposta no Excel, ela
  // encontra este registro e o completa.
  let orcamentoId = b.orcamentoId || null;
  let orcamentoCriado = null;
  if (!orcamentoId) {
    const numeroOrc = `${numero}-${String(ano).slice(-2)}`;
    // ⚠ pode existir um orçamento com esse número que a conta acima não viu (corrida entre duas
    // criações, importação rodando junto). Aproveita em vez de estourar o unique.
    const existente = await prisma.orcamento.findUnique({ where: { numero: numeroOrc }, select: { id: true } });
    if (existente) {
      orcamentoId = existente.id;
    } else {
      orcamentoCriado = await prisma.orcamento.create({
        data: {
          numero: numeroOrc, cliente,
          obra: String(b.obra || "").trim() || null,
          vendedor: user.name || null,
          criadoPorId: user.id,
        },
      });
      orcamentoId = orcamentoCriado.id;
    }
  }

  const estudo = await prisma.estudoFabricacao.create({
    data: {
      ano, numero, cliente,
      obra: String(b.obra || "").trim() || null,
      orcamentoId,
      metodo: b.metodo || "ESTIMATIVA",
      criadoPorId: user.id, criadoPorNome: user.name || null,
    },
  });
  return NextResponse.json({ ok: true, estudo, orcamentoCriado: orcamentoCriado?.numero || null });
}
