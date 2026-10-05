// CMR — lançamento de recebimentos de matéria-prima (Controle de Materiais Rastreáveis).
//   GET ?ano=2026&q=  → lista os lançamentos do ano (DocumentoQualidade categoria MATERIAL).
//   POST { lancamentos: [ {...} ] } → grava 1..N lançamentos com índice R automático por ano.
// Estoque/Almoxarifado lança; concilia com as RMs (lib/recebimento-cmr.js).
import { notificarMateriaisRecebidos } from "@/lib/recebimento-notificacoes";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT, prefixoAno, aprenderReferencias } from "@/lib/cmr";
import { gravarLoteCmr, loteJaGravado, hashDoLote, LoteConflito } from "@/lib/cmr-lote";
import { lerLinhasCmr } from "@/lib/cmr-sharepoint";
import { appendLinhasCmr } from "@/lib/cmr-sharepoint";
import { ehCascaVazia } from "@/lib/cmr-reconciliar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ⚠ 300, não 60: os 60 s foram o teto em que o lote do pedido 2054 (43 R) morreu no meio dos avisos.
// O conserto de verdade é o lote atômico e os avisos em massa; o teto maior é só margem.
export const maxDuration = 300;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const sp = new URL(req.url).searchParams;
  const ano = Number(sp.get("ano")) || new Date().getFullYear();
  const q = (sp.get("q") || "").trim();
  const pre = prefixoAno(ano);

  const where = { categoria: CMR_CAT, importRef: { startsWith: pre } };
  if (q) where.OR = [
    { nome: { contains: q, mode: "insensitive" } },
    { fornecedor: { contains: q, mode: "insensitive" } },
    { opNumero: { contains: q, mode: "insensitive" } },
    { nfNumero: { contains: q, mode: "insensitive" } },
    { importRef: { contains: q } },
    { numeroCorrida: { contains: q, mode: "insensitive" } },
  ];

  const [rows, _total, anosRaw] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where, orderBy: { importRef: "desc" }, take: 6000,
      select: {
        id: true, importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true,
        numeroDocumento: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true,
        pesoKg: true, quantidade: true, observacao: true, arquivoUrl: true, origem: true,
        // ⚠ A VALIDADE PRECISA VIR PARA A TELA POR CAUSA DA EDIÇÃO. O formulário de edição chega
        // preenchido com o que a listagem trouxe; sem este campo, editar a NF de um lote de tinta
        // devolveria a validade em branco e APAGARIA o FEFO daquele lote sem ninguém pedir.
        dataValidade: true,
      },
    }),
    prisma.documentoQualidade.count({ where: { categoria: CMR_CAT, importRef: { startsWith: pre } } }),
    prisma.documentoQualidade.findMany({ where: { categoria: CMR_CAT, importRef: { not: null } }, select: { importRef: true }, distinct: ["importRef"], take: 20000 }),
  ]);
  const anos = [...new Set(anosRaw.map((r) => 2000 + Number(String(r.importRef).slice(0, 2))).filter((a) => a >= 2000 && a < 2100))].sort((a, b) => b - a);
  // Esconde só as "cascas" DO FINAL — R reservado (sem nenhuma info) cujos índices são MAIORES
  // que o último R preenchido. Casca no MEIO (com R preenchido acima) continua aparecendo — é um
  // furo real que precisa ser visto. `rows` vem ordenado por importRef desc.
  let maxPreenchido = -1;
  for (const r of rows) { if (!ehCascaVazia(r)) { maxPreenchido = Number(r.importRef); break; } }
  const itens = rows.filter((r) => !ehCascaVazia(r) || Number(r.importRef) < maxPreenchido);
  return NextResponse.json({ success: true, ano, total: itens.length, itens, anos: anos.length ? anos : [ano] });
}

const lancSchema = z.object({
  rc: z.string().max(10).nullable().optional(),
  descricao: z.string().min(1, "Descrição obrigatória").max(300),
  especificacao: z.string().max(120).nullable().optional(),
  certificado: z.string().max(120).nullable().optional(),
  loteCorrida: z.string().max(120).nullable().optional(),
  pedidoCompra: z.string().max(60).nullable().optional(),
  dataRecebimento: z.union([z.string(), z.number()]).nullable().optional(),
  // validade do lote — pedida quando o material é tinta (ver lib/material-tinta.js)
  validade: z.union([z.string(), z.number()]).nullable().optional(),
  nf: z.string().max(60).nullable().optional(),
  fornecedor: z.string().max(120).nullable().optional(),
  obra: z.string().max(60).nullable().optional(),
  qtd: z.union([z.string(), z.number()]).nullable().optional(),
  pesoLitro: z.union([z.string(), z.number()]).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
  arquivoUrl: z.string().max(500).nullable().optional(),
  arquivoNome: z.string().max(200).nullable().optional(),
}).passthrough();

const schema = z.object({
  ano: z.number().int().optional(),
  lancamentos: z.array(lancSchema).min(1).max(500),
  // ⚠⚠ `espelhar: false` É O QUE DESTRAVA O BOTÃO "LANÇAR". Matheus (11/09/2026): "está lento o
  // botão de lançar; quando clicar já entrar na linha e ir carregando o que precisar nesse meio
  // tempo". A gravação no banco leva milissegundos; quem custava os segundos era o writeback no
  // SharePoint — seis chamadas ao Graph (achar o arquivo, detalhar, abrir sessão, achar o fim,
  // escrever, fechar) presas na frente da resposta. Com isto a rota responde assim que o R existe,
  // e a tela chama `/espelhar` em seguida sem travar ninguém.
  //
  // ⚠ NÃO ABRE BURACO: o que não for espelhado é reenviado pela reconciliação (diária, e no botão
  // "Sincronizar planilha"), que justamente anexa à planilha os R que o portal tem e ela não.
  espelhar: z.boolean().optional(),
  // ⚠⚠ A CHAVE DO LOTE, gerada no navegador e repetida a cada tentativa (lib/cmr-lote.js). Sem ela,
  // uma resposta perdida deixava o botão "Gravar" pronto para emitir os mesmos R de novo.
  loteId: z.string().uuid("Lote sem identificação — recarregue a tela e tente de novo."),
});

// Os campos que a tela mostra na listagem — a resposta do lançamento devolve a linha pronta para
// entrar na tabela sem um GET novo.
const SELECT_LISTA = {
  id: true, importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true,
  numeroDocumento: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true,
  pesoKg: true, quantidade: true, observacao: true, arquivoUrl: true, origem: true, dataValidade: true,
};

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ano = body.ano || new Date().getFullYear();
  const lote = { loteId: body.loteId, hash: hashDoLote(body.lancamentos), userId: user.id, select: SELECT_LISTA };

  // ⚠ O REENVIO RESPONDE ANTES DE IR AO SHAREPOINT: ele não emite R, só devolve os que já existem.
  let resultado;
  try { resultado = await loteJaGravado(prisma, lote); }
  catch (e) { return e instanceof LoteConflito ? conflito(e) : incerto(e); }

  if (!resultado) {
    // ⚠⚠ O R É CONFERIDO NA PLANILHA ANTES DE SER EMITIDO (Matheus, 22/09/2026: "antes de mandar,
    // verifica se o R está disponível na planilha"). Emitir olhando só o portal foi metade do defeito
    // do R 261547: a planilha tem linhas que o portal não importa — a "casca", o R reservado sem
    // descrição —, então o próximo número daqui já estava ocupado lá, e dois materiais diferentes
    // passaram a dividir um índice.
    //
    // ⚠⚠ SEM CONSEGUIR LER A PLANILHA, NÃO SE EMITE R. É recusa deliberada: o lançamento fica para
    // daqui a pouco, enquanto um número duplicado contamina o certificado que vai ao cliente e só
    // aparece semanas depois. Quem lê a mensagem sabe o que houve e tenta de novo.
    let ocupados;
    try {
      ocupados = (await lerLinhasCmr(ano)).map((l) => String(l.indiceR || "").trim()).filter(Boolean);
    } catch (e) {
      return NextResponse.json({
        error: "Não consegui conferir a numeração na planilha do SharePoint, e sem isso o R pode sair "
          + `repetido. Tente de novo em instantes. (${e.message})`,
      }, { status: 503 });
    }
    try { resultado = await gravarLoteCmr(prisma, { ...lote, ano, lancamentos: body.lancamentos, ocupados }); }
    catch (e) {
      if (e instanceof LoteConflito) return conflito(e);
      // ⚠⚠ ERRO NA GRAVAÇÃO NÃO PROVA QUE NADA FOI GRAVADO (achado do Codex, 05/10/2026): a resposta do
      // commit pode se perder com o commit feito. Antes de dizer "nada foi gravado", confere.
      try { resultado = await loteJaGravado(prisma, lote); }
      catch (e2) { return e2 instanceof LoteConflito ? conflito(e2) : incerto(e2); }
      if (!resultado) {
        return NextResponse.json({ error: `Falha ao gravar o lote — nada foi gravado: ${e.message}` }, { status: 500 });
      }
    }
  }

  // Depois do commit, e idempotentes: num reenvio completam o que a tentativa interrompida deixou.
  await notificarMateriaisRecebidos(resultado.docs, user.id);
  if (!resultado.replay) await aprenderReferencias(body.lancamentos).catch(() => {});

  // Espelha na planilha do SharePoint (best-effort — NUNCA trava o lançamento no portal).
  // Com `espelhar: false` a tela faz isso depois, por /api/compras/cmr/espelhar, e não espera.
  let planilha = null;
  if (body.espelhar !== false && !resultado.replay) {
    const linhasSP = body.lancamentos.map((l, i) => ({
      rc: l.rc, indiceR: resultado.indices[i], descricao: l.descricao, certificado: l.certificado, loteCorrida: l.loteCorrida,
      especificacao: l.especificacao, pedidoCompra: l.pedidoCompra, dataRecebimento: l.dataRecebimento,
      nf: l.nf, fornecedor: l.fornecedor, obra: l.obra, qtd: l.qtd, pesoLitro: l.pesoLitro,
      validade: l.validade, observacao: l.observacao,
    }));
    try { planilha = await appendLinhasCmr(ano, linhasSP); }
    catch (e) { planilha = { ok: false, erro: e.message }; }
  }

  return NextResponse.json({
    success: true, ano, criados: resultado.docs.length, replay: resultado.replay,
    indices: resultado.indices, itens: resultado.docs, planilha,
  });
}

const conflito = (e) => NextResponse.json({ error: e.message, indices: e.indices || [] }, { status: 409 });

// Sem conseguir LER o lote ninguém sabe se ele foi gravado — e dizer "nada foi gravado" aqui é o
// convite exato a lançar de novo com outra chave. A tela repete com a MESMA chave, o que é seguro.
const incerto = (e) => NextResponse.json({
  incerta: true,
  error: `Não consegui conferir se este lote já foi gravado (${e.message}). Clique em Gravar de novo: `
    + "o portal reconhece o mesmo lote e não duplica os R.",
}, { status: 503 });
