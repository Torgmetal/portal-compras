// Classifica e-mails da Engenharia em MARCOS de projeto usando o Claude — pega o que
// a regra por palavra-chave (lib/match-email-op.js) não identifica. Roda em lote no cron
// só nos e-mails ainda "OUTRO"/não-checados, marcando iaChecado pra não reprocessar.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const MODELO = process.env.EMAILS_IA_MODELO || "claude-sonnet-4-6";
const MARCOS = ["IFC_RECEBIDO", "LIBERACAO_INICIO", "PROJETO_ENVIADO", "APROVADO_CLIENTE", "OUTRO"];

const SYSTEM = `Você classifica e-mails da Engenharia de uma fabricante de estruturas metálicas (Torg Metal) em MARCOS do fluxo de projeto. Cada e-mail tem uma DIREÇÃO: ENTRADA (o cliente/terceiro mandou pra Torg) ou SAIDA (a Torg mandou pro cliente).

Classifique cada e-mail em EXATAMENTE UM marco:
- IFC_RECEBIDO: ENTRADA em que o cliente ENVIA o modelo/arquivo IFC, projeto base, modelo 3D, arquivos de referência p/ a Torg iniciar o detalhamento.
- LIBERACAO_INICIO: ENTRADA em que o cliente LIBERA/AUTORIZA o início do projeto ou da fabricação, dá "de acordo" pra começar, envia ordem de serviço/compra pra iniciar, ou diz que pode começar.
- PROJETO_ENVIADO: SAIDA em que a Torg ENVIA o projeto/desenho/detalhamento pro cliente PARA APROVAÇÃO/análise/validação (submete pra aprovar).
- APROVADO_CLIENTE: ENTRADA em que o cliente APROVA o projeto/desenho enviado, dá "aprovado", "liberado para fabricação", "pode fabricar", "de acordo com o projeto".
- OUTRO: qualquer troca técnica comum (dúvidas, revisões pontuais, memoriais, follow-up, cobrança, agenda) que NÃO seja um dos marcos acima.

Regras:
- Respeite a DIREÇÃO: IFC/LIBERACAO/APROVADO só valem em ENTRADA; PROJETO_ENVIADO só em SAIDA.
- Na dúvida, use OUTRO. Não force um marco.
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
    const marco = MARCOS.includes(it.marco) ? it.marco : "OUTRO";
    const confianca = Math.max(0, Math.min(1, Number(it.confianca) || 0));
    return { marco, confianca };
  });
}

/** Reprocessa por IA os e-mails ainda não checados que ficaram "OUTRO" na regra. */
export async function classificarMarcosIA(limite = 40, tamanhoLote = 20) {
  const pendentes = await prisma.obraEmailEvento.findMany({
    where: { iaChecado: false, OR: [{ tipoGatilho: "OUTRO" }, { tipoGatilho: null }] },
    orderBy: { recebidoEm: "desc" },
    take: limite,
    select: { id: true, assunto: true, snippet: true, direcao: true },
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
      // só sobrescreve o gatilho quando a IA acha um marco de verdade (não rebaixa)
      if (r.marco && r.marco !== "OUTRO") { data.tipoGatilho = r.marco; data.marcoFonte = "IA"; data.matchConfianca = r.confianca || undefined; marcos++; }
      await prisma.obraEmailEvento.update({ where: { id: lote[j].id }, data }).catch(() => {});
    }
  }
  return { classificados: pendentes.length, marcos };
}
