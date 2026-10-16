// ─── PORTÃO DE IA DA ENGENHARIA — conferência, repasse e registro ───────────────────────────────
//
// O app Torg Engenharia (e o Claude Code do piloto) fala com ESTA rota como se fosse a API da Anthropic
// (`ANTHROPIC_BASE_URL=https://workspace.torg.com.br/api/engenharia-ia`, token do aparelho no lugar da chave).
// Antes de gastar um token, em ordem: aparelho ATIVO → usuário ativo com ENGENHARIA (ou ADMIN) → modelo do piloto →
// teto do mês em R$ → ritmo. Só então vai à Anthropic com a chave da EMPRESA (`ANTHROPIC_API_KEY_ENGENHARIA`,
// separada da chave dos PDFs). Spec: docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md, F1.
//
// ⚠ O teto é FLEXÍVEL: duas chamadas simultâneas no limite podem passar um pouco — o custo só existe depois da resposta.
// ⚠ Gravar o consumo nunca derruba a resposta: ela já foi entregue ao projetista quando o registro acontece.
import "server-only";
import { prisma } from "./prisma";
import { autenticarAparelho } from "./ia-aparelho-auth";
import { MODELOS_PERMITIDOS, custoUsd, usdParaBrl, pedidoDoProjetista, LeitorUsage, inicioDoMesSP } from "./ia-engenharia";

const ANTHROPIC = "https://api.anthropic.com";
const MAX_POR_MINUTO = 60;
const COTACAO_PADRAO = 5.5;
const brl = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Erro no formato da API da Anthropic — o SDK do app mostra `error.message` ao projetista. */
export const erroAnthropic = (status, tipo, mensagem) =>
  new Response(JSON.stringify({ type: "error", error: { type: tipo, message: mensagem } }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function registrar(dados) {
  try { await prisma.iaUso.create({ data: dados }); } catch { /* registro nunca derruba a resposta */ }
}

/** Aparelho + usuário, ou a resposta de recusa (formato Anthropic). */
async function autenticar(req) {
  const r = await autenticarAparelho(req);
  if (!r.recusa) return r;
  const { status, mensagem, aparelho } = r.recusa;
  // ⚠ o registro de consumo é do portão, não do helper: 403 = aparelho válido, usuário sem acesso
  if (status === 403) await registrar({ aparelhoId: aparelho.id, userId: aparelho.userId, situacao: "recusado_acesso" });
  return { recusa: erroAnthropic(status, status === 401 ? "authentication_error" : "permission_error", mensagem) };
}

function cotacao() {
  const c = Number(process.env.IA_COTACAO_USD_BRL);
  return c > 0 ? c : COTACAO_PADRAO;
}

/**
 * Atende `POST /v1/messages` (`contar: false`) ou `/v1/messages/count_tokens` (`contar: true`).
 * @param {Request} req
 */
export async function atenderPortao(req, { contar = false } = {}) {
  const inicio = Date.now();
  const bruto = await req.text();
  let corpo;
  try { corpo = JSON.parse(bruto); } catch { return erroAnthropic(400, "invalid_request_error", "Corpo da requisição não é JSON."); }

  const { aparelho, user, recusa } = await autenticar(req);
  if (recusa) return recusa;
  const base = { aparelhoId: aparelho.id, userId: user.id, modelo: String(corpo.model || "") || null };

  if (!MODELOS_PERMITIDOS.includes(corpo.model)) {
    if (!contar) await registrar({ ...base, situacao: "recusado_modelo" });
    return erroAnthropic(400, "invalid_request_error", `Modelo "${corpo.model}" não liberado: use Opus 5.5 ou Sonnet 5.5 (claude-opus-5-5, claude-sonnet-5-5).`);
  }

  if (!contar) {
    const limite = await prisma.iaLimite.findUnique({ where: { userId: user.id } });
    if (!limite) return erroAnthropic(403, "permission_error", "Você ainda não tem teto mensal definido. Peça ao administrador do portal.");
    const soma = await prisma.iaUso.aggregate({ where: { userId: user.id, createdAt: { gte: inicioDoMesSP() } }, _sum: { custoBrl: true } });
    const gasto = Number(soma?._sum?.custoBrl) || 0;
    if (gasto >= limite.tetoMensalBrl) {
      await registrar({ ...base, situacao: "recusado_teto" });
      return erroAnthropic(429, "rate_limit_error", `Teto do mês atingido (${brl(gasto)} de ${brl(limite.tetoMensalBrl)}). Fale com o administrador do portal para ampliar.`);
    }
    const recentes = await prisma.iaUso.count({ where: { aparelhoId: aparelho.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    if (recentes >= MAX_POR_MINUTO) {
      await registrar({ ...base, situacao: "recusado_ritmo" });
      return erroAnthropic(429, "rate_limit_error", `Muitas chamadas em sequência (${MAX_POR_MINUTO}/min). Aguarde um minuto.`);
    }
  }

  const chave = process.env.ANTHROPIC_API_KEY_ENGENHARIA;
  if (!chave) return erroAnthropic(503, "api_error", "O portão de IA da Engenharia ainda não tem chave configurada. Fale com o administrador do portal.");

  // ⚠ só estes cabeçalhos seguem — nunca o Authorization/x-api-key do aparelho, cookie ou IP do PC
  const headers = { "content-type": "application/json", "x-api-key": chave, "anthropic-version": req.headers.get("anthropic-version") || "2023-06-01" };
  const beta = req.headers.get("anthropic-beta");
  if (beta) headers["anthropic-beta"] = beta;

  const resp = await fetch(`${ANTHROPIC}/v1/messages${contar ? "/count_tokens" : ""}`, { method: "POST", headers, body: bruto });
  prisma.iaAparelho.update({ where: { id: aparelho.id }, data: { ultimoUsoEm: new Date() } }).catch(() => {});
  const cabecalhos = { "content-type": resp.headers.get("content-type") || "application/json", "cache-control": "no-store" };
  if (contar || !resp.body) return new Response(resp.body, { status: resp.status, headers: cabecalhos });

  // repassa byte a byte e lê o `usage` no caminho; o registro sai quando o stream termina
  const leitor = new LeitorUsage();
  const dec = new TextDecoder();
  const pedido = pedidoDoProjetista(corpo.messages);
  const ok = resp.ok;
  const passagem = new TransformStream({
    transform(pedaco, c) { leitor.alimentar(dec.decode(pedaco, { stream: true })); c.enqueue(pedaco); },
    async flush() {
      const u = leitor.usage();
      const usd = ok ? custoUsd(corpo.model, u) : 0;
      await registrar({
        ...base, situacao: ok ? "ok" : "erro", pedido, duracaoMs: Date.now() - inicio,
        inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens, cacheWriteTokens: u.cache_creation_input_tokens,
        custoUsd: usd, custoBrl: usdParaBrl(usd, cotacao()),
      });
    },
  });
  return new Response(resp.body.pipeThrough(passagem), { status: resp.status, headers: cabecalhos });
}
