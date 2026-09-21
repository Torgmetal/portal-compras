// GET  /api/qualidade/pit/{opNumero}       → o padrão escolhido da obra + as opções
// PUT  /api/qualidade/pit/{opNumero}       → grava o padrão
// GET  /api/qualidade/pit/{opNumero}/excel → o PIT no padrão Torg
//
// Vitor (26/08/2026): "o PIT nasce com a proposta — vamos informar qual o padrão que vamos usar na
// criação da proposta"; e depois: "também pode ser selecionado na aba da qualidade, igual vamos
// fazer no PLP".
//
// ⚠ O PADRÃO FICA NA OP, não num documento. É decisão DA OBRA: o PIT sai dele hoje, e o escopo de
// inspeção e o Data Book podem sair amanhã. Guardar no documento faria a segunda tela ter de
// adivinhar de novo.
import {z} from "zod";
import {podeGerenciarPit,requireGestaoPit,requireConsultaPit} from "@/lib/pit-acesso";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PIT_PADROES, PIT_PADRAO } from "@/lib/pit-padroes";
import { pitDaOpParaDataBook } from "@/lib/databook-pit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP", "ENGENHARIA", "PLANEJAMENTO", "COMPRAS", "EXPEDICAO", "FINANCEIRO", "ALMOXARIFADO"];
const numDaRota = async (params) => String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");

export async function GET(req, { params }) {
  let user;
  try { user=await requireConsultaPit(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await numDaRota(params);
  const op = await prisma.oP.findFirst({
    where: { numero: opNumero },
    select: { numero: true, cliente: true, obra: true, refCliente: true, pitPadrao: true, pitRevisao: true },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  return NextResponse.json({
    podeGerenciar:await podeGerenciarPit(user),
    op,
    padrao: op.pitPadrao || null,
    revisao: op.pitRevisao || "0",
    // ⚠ vai o RESUMO de cada padrão junto: escolher entre cinco siglas sem saber o que muda é como
    // a Qualidade acaba emitindo o PIT errado — e o errado só aparece na auditoria do cliente.
    opcoes: PIT_PADROES.map((p) => ({ id: p.id, nome: p.nome, resumo: p.resumo, itens: p.linhas.length })),
  });
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireGestaoPit(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await numDaRota(params);
  const parsed=z.object({padrao:z.string().nullable(),revisao:z.string().max(10).optional()}).safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Dados de PIT inválidos."},{status:400});
  const {padrao,revisao}=parsed.data;
  if (padrao && !PIT_PADRAO[padrao]) return NextResponse.json({ error: "Padrão de PIT desconhecido." }, { status: 400 });

  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true, pitPadrao: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  await prisma.oP.update({
    where: { id: op.id },
    data: { pitPadrao: padrao || null, pitRevisao: String(revisao ?? "").trim().slice(0, 10) || null },
  });

  // O Data Book e o PIT não são duas verdades: ao escolher o padrão da OP, a seção 10 existente
  // recebe a mesma tabela. Isso também mantém compatibilidade com telas antigas que liam somente
  // `conteudoJson`, antes do fallback vivo introduzido no detalhe do Data Book.
  const dataBook = await prisma.dataBookQualidade.findUnique({
    where: { opNumero },
    select: { secoes: { where: { numero: "10" }, select: { id: true, conteudoJson: true }, take: 1 } },
  });
  const secaoPit = dataBook?.secoes?.[0];
  if (secaoPit && padrao) {
    const revisaoLimpa = String(revisao ?? "").trim().slice(0, 10) || "0";
    const revisaoNumero = (revisaoLimpa.match(/\d+/) || ["0"])[0].padStart(2, "0");
    await prisma.dataBookSecao.update({
      where: { id: secaoPit.id },
      data: {
        estado: "ANEXADO",
        conteudoJson: pitDaOpParaDataBook(padrao, revisaoLimpa),
      },
    });
    const nome = `Plano de Inspeção e Testes T${opNumero}-R${revisaoNumero}`;
    const dadosDocumento = {
      nome, categoria: "ANEXO", tipo: "Anexo — PIT/ITP — plano de inspeção e testes",
      opNumero, numeroDocumento: `PIT T${opNumero}`, origem: "pit_portal",
      arquivoUrl: `/api/qualidade/planos/${opNumero}/pdf?doc=PIT`,
      arquivoNome: `PIT-T${opNumero}-R${revisaoNumero}.pdf`, arquivoTipo: "application/pdf",
      validado: true, ativo: true,
    };
    const existente = await prisma.documentoQualidade.findFirst({
      where: { opNumero, categoria: "ANEXO", tipo: dadosDocumento.tipo, nome },
      select: { id: true },
    });
    const documento = existente
      ? await prisma.documentoQualidade.update({ where: { id: existente.id }, data: dadosDocumento })
      : await prisma.documentoQualidade.create({ data: dadosDocumento });
    await prisma.dataBookSecaoDoc.upsert({
      where: { secaoId_documentoId: { secaoId: secaoPit.id, documentoId: documento.id } },
      create: { secaoId: secaoPit.id, documentoId: documento.id },
      update: {},
    });
  } else if (secaoPit?.conteudoJson?.origem === "OP") {
    await prisma.dataBookSecao.update({
      where: { id: secaoPit.id },
      data: { estado: "PENDENTE", conteudoJson: null },
    });
  }
  // ⚠ trocar o padrão de PIT muda o que a Qualidade vai inspecionar na obra inteira — fica no log.
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PIT_PADRAO", entity: "OP", entityId: op.id,
      diff: { op: opNumero, de: op.pitPadrao || null, para: padrao || null } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, padrao: padrao || null });
}
