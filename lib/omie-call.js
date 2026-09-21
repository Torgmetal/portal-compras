import { emModoDemo, MENSAGEM_OMIE_DEMO } from "@/lib/modo-demo";
// Chamada única e RESILIENTE à API REST do Omie. Todos os módulos omie-*.js
// (e portanto todos os crons) devem passar por aqui — assim o tratamento de
// erro transitório fica num lugar só.
//
// Reintenta em erros TRANSITÓRIOS do Omie:
//   - instabilidade do servidor: "SOAP-ERROR: Broken response from Application
//     Server (BG)" e afins;
//   - rate-limit: método já em execução / consumo redundante (respeita o
//     "Aguarde N segundos" quando o Omie informa);
//   - corpo não-JSON (resposta quebrada) e timeout/rede.
// NÃO reintenta erro de NEGÓCIO (ex.: fim de paginação, "não cadastrada") — só
// os transitórios acima; o resto lança na hora.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAULT_RETRY = /sendo executada|Consumo (redundante|indevido)|tente novamente|tentar novamente|SOAP-00097|em processamento|Broken response|Application Server|SOAP-ERROR/i;
const MAX_TENTATIVAS = 5;

/**
 * Mensagem de quem parou por causa do relógio, não por causa do Omie.
 *
 * ⚠ Ela existe para o chamador distinguir "o Omie está fora do ar" de "acabou o meu tempo" —
 * o primeiro é incidente, o segundo é rodada parcial e normal.
 */
export const ORCAMENTO_ESGOTADO = "Orçamento de tempo esgotado antes da resposta do Omie";

/**
 * @param {string} url    endpoint Omie (ex.: https://app.omie.com.br/api/v1/...)
 * @param {string} call   nome do método (ex.: "ListarPedidos")
 * @param {object} param  parâmetros do método (vira `param: [param]`)
 * @param {{ timeout?: number, retryTransport?: boolean, ateMs?: number }} [opts]
 *   retryTransport: reintenta em timeout/rede/corpo-quebrado (default true). O
 *   estoque usa timeout curto de propósito (pula endpoint travado) → passa false
 *   ali, mantendo só o retry de faultstring transitória ("Broken response" etc.).
 *
 *   ateMs: PRAZO ABSOLUTO (`Date.now()` limite) para esta chamada inteira, com
 *   tentativas e esperas dentro. Ver `ORCAMENTO_ESGOTADO` abaixo. Sem ele nada muda.
 */
export async function omieCall(url, call, param, opts = {}) {
  // ⚠ DEMO: nem lê nem escreve no ERP. A mensagem é a que a tela mostra. Ver lib/modo-demo.js.
  if (emModoDemo()) throw new Error(`${MENSAGEM_OMIE_DEMO} (${call})`);
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)");
  const timeout = opts.timeout || 45000;
  const retryTransport = opts.retryTransport !== false;
  const ateMs = Number(opts.ateMs) > 0 ? Number(opts.ateMs) : null;
  return doCall({ url, call, param, key, secret, timeout, retryTransport, ateMs, tentativa: 0 });
}

/** Quanto falta para o prazo, ou `Infinity` quando não há prazo. */
const restante = (ateMs) => (ateMs == null ? Infinity : ateMs - Date.now());

async function doCall(ctx) {
  const { url, call, param, key, secret, timeout, retryTransport, ateMs, tentativa } = ctx;

  // ⚠⚠ O PRAZO VALE ANTES DE COMEÇAR, TAMBÉM. Quem chama em laço confere o relógio entre um
  // pedido e outro; sem esta linha, o último pedido do laço ainda poderia gastar 45s × 5.
  if (restante(ateMs) <= 0) throw new Error(`${ORCAMENTO_ESGOTADO} (${call})`);

  // Espera respeitando o "Aguarde N segundos" do Omie; senão backoff progressivo.
  const retry = async (msg) => {
    if (tentativa >= MAX_TENTATIVAS) throw new Error(msg);
    const m = /aguarde\s+(\d+)\s*segundo/i.exec(msg);
    const espera = m ? Math.min(Number(m[1]) + 2, 60) * 1000 : 1500 * (tentativa + 1);
    // ⚠ Dormir 60s para tentar de novo depois do prazo é gastar o orçamento de quem vem
    // atrás sem chance nenhuma de sucesso. Desiste agora e devolve o motivo real.
    if (espera >= restante(ateMs)) throw new Error(`${ORCAMENTO_ESGOTADO} — última falha: ${msg}`);
    await sleep(espera);
    return doCall({ ...ctx, tentativa: tentativa + 1 });
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
      // ⚠⚠ O TIMEOUT ENCOLHE PARA CABER NO PRAZO. Era daqui que vinha o furo: 45s por
      // tentativa é mais que o orçamento inteiro de algumas etapas, e o `AbortSignal` é o
      // ÚNICO ponto que realmente corta uma conexão pendurada — `Promise.race` devolveria o
      // controle mas deixaria a requisição viva, gravando depois de a trava ser solta.
      signal: AbortSignal.timeout(Math.max(1, Math.min(timeout, restante(ateMs)))),
    });
  } catch (e) {
    if (!retryTransport) throw e;               // timeout curto proposital → não reintenta
    return retry(e?.message || "Falha de rede no Omie"); // timeout/rede → transitório
  }

  // Corpo pode vir quebrado (não-JSON) no "Broken response" — trata como transitório.
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); }
  catch {
    if (!retryTransport) throw new Error(`Resposta inválida do Omie (HTTP ${res.status})`);
    return retry(`Resposta inválida do Omie (HTTP ${res.status})`);
  }

  if (data.faultstring) {
    if (FAULT_RETRY.test(data.faultstring)) return retry(data.faultstring);
    throw new Error(data.faultstring);
  }
  return data;
}
