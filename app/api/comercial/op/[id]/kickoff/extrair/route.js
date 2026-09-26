// POST /api/comercial/op/[id]/kickoff/extrair — extrai dados de Kick Off do
// PDF da proposta comercial via Claude (document block base64 + resposta no
// formato de ESQUEMA_KICKOFF + sanitização).
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { pedirJson } from "@/lib/ia-json";
import { ESQUEMA_KICKOFF } from "@/lib/ia-esquemas";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { escopoDeCompraDoEstudo } from "@/lib/op-categorias";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const limiter = createRateLimiter({ name: "kickoff-extrair", maxRequests: 6, windowMs: 60_000 });
const MAX_B64_LEN = 16 * 1024 * 1024; // ~12MB

// Sonnet: a proposta é um documento longo e o escopo exige leitura cuidadosa
// (as rotas de análise do comercial já usam este modelo).
const MODELO_FIXO = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Você é um analista comercial da Torg Metal (estruturas metálicas). Vai receber o PDF de uma PROPOSTA COMERCIAL emitida pela Torg para um cliente, e deve extrair as informações para o documento de KICK OFF — a reunião de alinhamento interna que divulga o contrato aos setores (engenharia, PCP, produção, compras, expedição).

EXTRAIA o que estiver no documento, sem inventar. Campo sem informação: texto vazio (""), número 0, lista vazia.

- escopo: resumo curto do fornecimento em 2-3 frases corridas (até 400 caracteres): o que é a obra e o que a Torg entrega. Inclusões e exclusões vão nos campos próprios, não aqui.
- escopoIncluso: array de strings — itens que ESTÃO incluídos no fornecimento (fabricação, montagem, pintura, transporte, projetos, ART...). Frases curtas, um item por string.
- escopoExcluso: array de strings — itens EXPRESSAMENTE excluídos / por conta do cliente (fundações, energia, andaimes, chumbadores...). Frases curtas.
- resumoPesos: array de {descricao, qtd, pesoKg} — quando a proposta tiver tabela/lista de itens com pesos (estrutura, telhas, acessórios), traga o resumo por grupo. Sem a linha de "TOTAL": o total é calculado na tela. Números em kg, sem valores em R$.
- dataEntregaAcordada: prazo de entrega acordado, como data "YYYY-MM-DD" se houver data explícita.
- tipoFaturamento: como a proposta define o faturamento (ex.: "por medições mensais", "por eventos", "30/60/90"...).
- faturamentoEventos: array de {descricao, percentual, valor, prazoPagamento, medicao, obsNF} — os eventos/parcelas de faturamento da proposta (ex.: {descricao: "Entrada", percentual: 10, valor: 150000, prazoPagamento: "28 dias após NF", medicao: "", obsNF: ""}). Valores em número (sem R$ no texto).
- retencaoContratual: retenção contratual se houver (ex.: "5% — liberação após entrega/CND").
- segurosObrigatorios: seguros exigidos (garantia, RC, riscos de engenharia...).
- padraoPintura: o esquema de pintura definido (primer/intermediário/acabamento, produtos, demãos, espessuras em µm, cor, norma).
- inspecao: requisitos de inspeção, ensaios, normas de qualidade, ITPs, visitas de inspetor do cliente, liberação de romaneio etc.
- entregaEndereco: endereço ou local de ENTREGA da obra (cidade/UF no mínimo). Atenção: NÃO é o endereço fiscal do cliente.
- frete: "TORG" se o frete é por conta da Torg (CIF/incluso), "CLIENTE" se por conta do cliente (FOB/retirada), vazio se não especificado.
- pedidoCompraCliente: número do pedido de compra/ordem de compra do CLIENTE, se citado.
- notaRetorno: true se houver menção a nota de retorno / remessa para industrialização / material do cliente que retorna; false se claramente não há; null se não dá para saber.
- faturamentoObs: observações complementares de faturamento que não couberam nos eventos (impostos destacados, condições especiais). Curto.

REGRAS
- Não invente nada: só o que está escrito no documento.
- Valores e percentuais: transcreva como estão.`;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const rl = limiter(req, `user:${user.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Muitas extrações em sequência — aguarde um minuto." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }
  const pdfBase64 = String(body.pdfBase64 || "");
  if (!pdfBase64) return NextResponse.json({ error: "pdfBase64 obrigatório" }, { status: 400 });
  if (pdfBase64.length > MAX_B64_LEN) return NextResponse.json({ error: "PDF grande demais para processar." }, { status: 413 });

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, obra: true, estudoDados: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const escopoEstudo = escopoDeCompraDoEstudo(op.estudoDados);

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const cleanB64 = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;

    const { dados, texto: rawText, parada, message } = await pedirJson(anthropic, {
      model: MODELO_FIXO,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: cleanB64 } },
          { type: "text", text: `Contexto: OP ${op.numero} — cliente ${op.cliente}${op.obra ? `, obra ${op.obra}` : ""}. Extraia os dados de kick off.` },
        ],
      }],
      formato: ESQUEMA_KICKOFF,
    });

    if (!dados) {
      const error = parada === "max_tokens"
        ? "A proposta gerou texto demais para uma resposta e a leitura foi cortada."
        : "A leitura da proposta não devolveu dados. Tente de novo.";
      return NextResponse.json({ error, rawPreview: rawText.slice(0, 500) }, { status: 502 });
    }

    // Sanitização leve
    const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const strArr = (v, maxItens, maxLen) => Array.isArray(v)
      ? v.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, maxLen)).slice(0, maxItens)
      : [];
    // Escopo é só o RESUMO: derruba à força qualquer linha que pareça item de
    // lista (incluso/excluso têm campos próprios) e corta em 400 chars.
    const limparEscopo = (v) => {
      if (typeof v !== "string") return null;
      const semListas = v
        .split("\n")
        .filter((l) => !/^\s*([-•*▪◦✓✔✅🚫❌➤›]|\d+[.)])\s/u.test(l) && !/^\s*(inclu[íi]do|exclu[íi]do|inclus|exclus)/i.test(l.trim()))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return semListas ? semListas.slice(0, 400) : null;
    };
    const out = {
      escopo:              limparEscopo(dados.escopo),
      // ⚠ O escopo de COMPRA vem do ESTUDO, não da IA: família com verba entra como incluso, sem
      // verba entra como excluso pra Engenharia e Compras confirmarem. Vitor (19/08): "temos obras
      // que não vão ter compra de parafusos e isso pode ser um ponto de alerta, pois acaba
      // passando". É determinístico — a planilha diz, não o modelo interpreta.
      escopoIncluso:       strArr([...strArr(dados.escopoIncluso, 40, 300), ...escopoEstudo.incluso], 60, 300),
      escopoExcluso:       strArr([...strArr(dados.escopoExcluso, 40, 300), ...escopoEstudo.excluso], 60, 300),
      // Qualquer linha com "total" no nome fica fora ("TOTAL", "Peso Total",
      // "Total Geral"...) — o total é calculado na tela
      resumoPesos:         Array.isArray(dados.resumoPesos)
        ? dados.resumoPesos
            .filter((p) => p && typeof p.descricao === "string" && p.descricao.trim() && !/\btotal\b/i.test(p.descricao))
            .map((p) => ({ descricao: p.descricao.trim().slice(0, 200), qtd: Number(p.qtd) || null, pesoKg: Number(p.pesoKg) || null }))
            .slice(0, 60)
        : [],
      dataEntregaAcordada: /^\d{4}-\d{2}-\d{2}$/.test(String(dados.dataEntregaAcordada || "")) ? dados.dataEntregaAcordada : null,
      tipoFaturamento:     str(dados.tipoFaturamento, 500),
      faturamentoEventos:  Array.isArray(dados.faturamentoEventos)
        ? dados.faturamentoEventos
            .filter((e2) => e2 && typeof e2.descricao === "string" && e2.descricao.trim())
            .map((e2) => ({
              descricao: e2.descricao.trim().slice(0, 200),
              percentual: Number(e2.percentual) || null,
              valor: Number(e2.valor) || null,
              prazoPagamento: typeof e2.prazoPagamento === "string" ? e2.prazoPagamento.trim().slice(0, 120) || null : null,
              medicao: typeof e2.medicao === "string" ? e2.medicao.trim().slice(0, 80) || null : null,
              obsNF: typeof e2.obsNF === "string" ? e2.obsNF.trim().slice(0, 500) || null : null,
            }))
            .slice(0, 40)
        : [],
      retencaoContratual:  str(dados.retencaoContratual, 500),
      segurosObrigatorios: str(dados.segurosObrigatorios, 1000),
      padraoPintura:       str(dados.padraoPintura, 5000),
      inspecao:            str(dados.inspecao, 5000),
      entregaEndereco:     str(dados.entregaEndereco, 2000),
      frete:               ["TORG", "CLIENTE"].includes(dados.frete) ? dados.frete : null,
      pedidoCompraCliente: str(dados.pedidoCompraCliente, 200),
      notaRetorno:         typeof dados.notaRetorno === "boolean" ? dados.notaRetorno : null,
      faturamentoObs:      str(dados.faturamentoObs, 5000),
    };

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "KICKOFF_EXTRAIR_IA", entity: "OP", entityId: op.id,
        diff: { opNumero: op.numero, model: MODELO_FIXO, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens },
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, dados: out, _meta: { model: MODELO_FIXO, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens } });
  } catch (e) {
    return NextResponse.json({ error: "Falha na extração: " + (e?.message || "erro desconhecido") }, { status: 500 });
  }
}
