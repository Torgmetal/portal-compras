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
 * @param {string} url    endpoint Omie (ex.: https://app.omie.com.br/api/v1/...)
 * @param {string} call   nome do método (ex.: "ListarPedidos")
 * @param {object} param  parâmetros do método (vira `param: [param]`)
 * @param {{ timeout?: number, retryTransport?: boolean }} [opts]
 *   retryTransport: reintenta em timeout/rede/corpo-quebrado (default true). O
 *   estoque usa timeout curto de propósito (pula endpoint travado) → passa false
 *   ali, mantendo só o retry de faultstring transitória ("Broken response" etc.).
 */
export async function omieCall(url, call, param, opts = {}) {
  const key = process.env.OMIE_APP_KEY, secret = process.env.OMIE_APP_SECRET;
  if (!key || !secret) throw new Error("Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET)");
  const timeout = opts.timeout || 45000;
  const retryTransport = opts.retryTransport !== false;
  return doCall({ url, call, param, key, secret, timeout, retryTransport, tentativa: 0 });
}

async function doCall(ctx) {
  const { url, call, param, key, secret, timeout, retryTransport, tentativa } = ctx;

  // Espera respeitando o "Aguarde N segundos" do Omie; senão backoff progressivo.
  const retry = async (msg) => {
    if (tentativa >= MAX_TENTATIVAS) throw new Error(msg);
    const m = /aguarde\s+(\d+)\s*segundo/i.exec(msg);
    const espera = m ? Math.min(Number(m[1]) + 2, 60) * 1000 : 1500 * (tentativa + 1);
    await sleep(espera);
    return doCall({ ...ctx, tentativa: tentativa + 1 });
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key: key, app_secret: secret, param: [param] }),
      signal: AbortSignal.timeout(timeout),
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
