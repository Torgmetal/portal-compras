// Classifica e-mails da Engenharia em TAGS do fluxo de projeto usando o Claude — refina o
// que a regra por palavra-chave (lib/match-email-op.js) não pega. Roda em lote no cron.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { TAGS } from "@/lib/match-email-op";

const MODELO = process.env.EMAILS_IA_MODELO || "claude-sonnet-4-6";

const SYSTEM = `Você classifica e-mails da Engenharia de uma fabricante de estruturas metálicas (Torg Metal) em TAGS do fluxo de projeto. Cada e-mail tem uma DIREÇÃO: ENTRADA (o cliente/terceiro mandou pra Torg) ou SAIDA (a Torg mandou pro cliente).

Classifique cada e-mail em EXATAMENTE UMA tag:
- IFC_RECEBIDO: ENTRADA em que o cliente ENVIA o modelo/arquivo IFC, projeto base, modelo 3D ou arquivos de referência p/ a Torg iniciar o detalhamento.
- LIBERACAO_INICIO: ENTRADA em que o cliente LIBERA/AUTORIZA o início do projeto/fabricação, dá "de acordo" pra começar, ou envia ordem de serviço/compra pra iniciar.
- PROJETO_ENVIADO: SAIDA em que a Torg ENVIA o projeto/desenho/detalhamento pro cliente PARA APROVAÇÃO/análise/validação.
- APROVADO_CLIENTE: ENTRADA em que o cliente APROVA o projeto/desenho enviado ("aprovado", "liberado para fabricação", "pode fabricar", "de acordo com o projeto").
- REPROVADO_CLIENTE: ENTRADA em que o cliente REPROVA o projeto, ou aprova COM RESSALVAS/pendências a corrigir antes de fabricar.
- REVISAO_CLIENTE: ENTRADA em que o cliente SOLICITA ALTERAÇÃO/REVISÃO num projeto já enviado (mudança de escopo, ajuste, nova versão, refazer) — retrabalho para a Engenharia.
- PENDENCIA_CLIENTE: SAIDA em que a Torg COBRA/AGUARDA algo do cliente (IFC, liberação, aprovação, resposta pendente). Serve pra medir atraso do cliente.
- RFI_TECNICO: dúvida/esclarecimento técnico (RFI) entre Eng e cliente, em qualquer direção, que NÃO seja aprovação/revisão/liberação.
- OUTRO: troca comum que não se encaixa acima (memoriais, agenda, follow-up genérico, cópias, avisos automáticos).

Regras:
- Respeite a DIREÇÃO: IFC/LIBERACAO/APROVADO/REPROVADO/REVISAO só valem em ENTRADA; PROJETO_ENVIADO e PENDENCIA_CLIENTE só em SAIDA; RFI_TECNICO em qualquer direção.
- Uma alteração pedida pelo cliente é REVISAO_CLIENTE; uma reprovação/ressalva é REPROVADO_CLIENTE; uma dúvida é RFI_TECNICO.
- Na dúvida, use OUTRO. Não force uma tag.
- confianca: 0.0 a 1.0.

Responda SOMENTE com JSON válido, um objeto por e-mail, na MESMA ORDEM recebida:
{"itens":[{"i":1,"marco":"OUTRO","confianca":0.9}]}`;

function extractJson(txt) {
  if (!txt) return null;
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let s = fence ? fence[1] : txt;
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

/** Classifica um lote de e-mails ([{assunto, snippet, direcao}]) → [{marco, confianca}]. */
export async function classificarLoteIA(emails) {
  if (!emails.length) return [];
  if (!process.env.ANTHROPIC_API_KEY) return emails.map(() => ({ marco: "OUTRO", confianca: 0 }));
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const linhas = emails.map((e, i) =>
    `E-mail ${i + 1} [${e.direcao}]\nAssunto: ${(e.assunto || "(sem assunto)").slice(0, 200)}\nTrecho: ${(e.snippet || "").slice(0, 400)}`
  ).join("\n\n");

  const message = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: `Classifique os ${emails.length} e-mails abaixo:\n\n${linhas}` }],
  });
  const raw = message?.content?.[0]?.text || "";
  const parsed = extractJson(raw) || {};
  const itens = Array.isArray(parsed.itens) ? parsed.itens : [];
  return emails.map((_, idx) => {
    const it = itens.find((x) => Number(x.i) === idx + 1) || {};
    const marco = TAGS.includes(it.marco) ? it.marco : "OUTRO";
    const confianca = Math.max(0, Math.min(1, Number(it.confianca) || 0));
    return { marco, confianca };
  });
}

/**
 * Classifica por IA os e-mails ainda não checados (ou TODOS, se forcar=true — usar 1x após
 * mudar a taxonomia). A IA pode SOBRESCREVER a tag por keyword quando tem confiança; se a IA
 * diz OUTRO, mantém a tag da keyword (não rebaixa).
 */
export async function classificarMarcosIA(limite = 120, tamanhoLote = 20, forcar = false) {
  const where = forcar ? {} : { iaChecado: false };
  const pendentes = await prisma.obraEmailEvento.findMany({
    where,
    orderBy: { recebidoEm: "desc" },
    take: limite,
    select: { id: true, assunto: true, snippet: true, direcao: true, tipoGatilho: true },
  });
  if (pendentes.length === 0) return { classificados: 0, marcos: 0 };

  let marcos = 0;
  for (let i = 0; i < pendentes.length; i += tamanhoLote) {
    const lote = pendentes.slice(i, i + tamanhoLote);
    let res;
    try { res = await classificarLoteIA(lote); } catch { res = lote.map(() => ({ marco: "OUTRO", confianca: 0 })); }
    for (let j = 0; j < lote.length; j++) {
      const r = res[j] || { marco: "OUTRO", confianca: 0 };
      const data = { iaChecado: true };
      // IA achou uma tag de verdade com confiança → usa (sobrescreve keyword). Se OUTRO, não rebaixa.
      if (r.marco && r.marco !== "OUTRO" && r.confianca >= 0.5) {
        data.tipoGatilho = r.marco; data.marcoFonte = "IA"; data.matchConfianca = r.confianca || undefined; marcos++;
      }
      await prisma.obraEmailEvento.update({ where: { id: lote[j].id }, data }).catch(() => {});
    }
  }
  return { classificados: pendentes.length, marcos };
}
