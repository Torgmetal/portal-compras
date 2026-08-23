import "server-only";

// ─── O MEDIDOR QUE NÃO DEPENDE DE NINGUÉM APONTAR ────────────────────────────
// Vitor (23/08/2026): "não pode ser, precisamos ver como vamos medir isso. Qual maneira você me
// indica para vermos esses números reais, pois agora a conversa é séria".
//
// A NF-e de saída. Ela é o único medidor de peso da empresa que:
//   · é completo por construção — não se embarca sem nota;
//   · é auditável — tem chave de acesso e está na Receita;
//   · vem em QUILO — os produtos da Torg são faturados em KG, não em peça;
//   · é retroativo — o histórico inteiro sai numa consulta, sem depender de ninguém lembrar.
//
// ⚠⚠ E TEM UMA ARMADILHA QUE EXPLICA OS "330 TONELADAS". Somando toda NF-e de saída dá 326.505
// kg/mês — que é de onde vem a lembrança. Só que isso é MOVIMENTO DE PORTÃO, não produção: o
// mesmo quilo sai como remessa para terceiro (5.924/5.901), volta como retorno (6.925/5.902) e
// só depois sai como venda. Contado três vezes.
//
// Separando por CFOP, a venda de verdade — 5.101 e 6.101, "venda de produção do estabelecimento"
// — dá 113.600 kg/mês em 14 meses. E o corte apontado no Syneco dá 111.739 kg/mês no mesmo
// período: 1,7% de diferença entre o medidor FISCAL e o medidor do CHÃO DE FÁBRICA, que não
// sabem um do outro. É a melhor prova que esses dados podem dar de que os dois estão certos.
//
// Por isso a leitura por CFOP não é detalhe: é o que separa 326 t de 113 t.
const URL = "https://app.omie.com.br/api/v1/produtos/nfconsultar/";

/** CFOPs que são VENDA de produção própria — o que a fábrica de fato entregou e faturou. */
export const CFOP_VENDA = ["5101", "6101", "5102", "6102"];
/** Remessa e retorno: o mesmo material cruzando o portão. Nunca somar com venda. */
export const CFOP_TRANSITO = ["5901", "5902", "5924", "5925", "6901", "6902", "6924", "6925", "5949", "6949", "5125", "6125"];

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma página de NF-e de saída do Omie.
 * ⚠ o Omie estrangula por consumo: sem o backoff, uma janela de 12 meses morre no meio e o mês
 * incompleto vira "queda de produção" no relatório.
 */
async function pagina(param, tentativa = 0) {
  const app_key = process.env.OMIE_APP_KEY, app_secret = process.env.OMIE_APP_SECRET;
  if (!app_key || !app_secret) throw new Error("Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET).");
  const resp = await fetch(URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call: "ListarNF", app_key, app_secret, param: [param] }),
  });
  const dados = await resp.json().catch(() => ({}));
  if (dados.faultstring && /consumo|processadas|aguarde|timeout/i.test(dados.faultstring) && tentativa < 6) {
    await espera(2000 * (tentativa + 1));
    return pagina(param, tentativa + 1);
  }
  return dados;
}

const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate();
const br = (ano, mes, dia) => `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;

/**
 * Peso e valor faturados num mês, separando venda de trânsito.
 * @returns {{ mes, nfs, kgVenda, kgTransito, kgOutros, valorVenda, porCfop }}
 */
export async function nfeSaidaDoMes(ano, mes) {
  const de = br(ano, mes, 1), ate = br(ano, mes, ultimoDia(ano, mes));
  let p = 1, paginas = 1, nfs = 0;
  let kgVenda = 0, kgTransito = 0, kgOutros = 0, valorVenda = 0;
  const porCfop = {};

  while (p <= paginas) {
    const d = await pagina({ pagina: p, registros_por_pagina: 50, apenas_importado_api: "N", dEmiInicial: de, dEmiFinal: ate, tpNF: 1, tpAmb: 1 });
    if (d.faultstring) {
      // ⚠ mês sem nota devolve erro, não lista vazia — tratar como zero, não como falha
      if (/nenhum|não encontrad|not found/i.test(d.faultstring)) break;
      throw new Error(`Omie: ${d.faultstring}`);
    }
    paginas = d.total_de_paginas || 1;
    for (const nf of d.nfCadastro || []) {
      // ⚠ nota cancelada continua listada: contá-la infla o mês e some no ano
      if (String(nf.ide?.cDeneg || "").toUpperCase() === "S" || nf.ide?.dCan) continue;
      nfs++;
      for (const item of nf.det || []) {
        const prod = item.prod || {};
        // ⚠ só item faturado em KG entra: item em UN (equipamento, serviço) não tem peso e
        // somar a quantidade dele com quilo produz um número que não é nada.
        if (!/^KG$/i.test(String(prod.uCom || ""))) continue;
        const kg = Number(prod.qCom) || 0;
        const cfop = soDigitos(prod.CFOP);
        porCfop[cfop] = (porCfop[cfop] || 0) + kg;
        if (CFOP_VENDA.includes(cfop)) { kgVenda += kg; valorVenda += Number(prod.vProd) || 0; }
        else if (CFOP_TRANSITO.includes(cfop)) kgTransito += kg;
        else kgOutros += kg;
      }
    }
    p++;
    await espera(400);
  }

  return {
    mes: `${ano}-${String(mes).padStart(2, "0")}`,
    nfs,
    kgVenda: Math.round(kgVenda),
    kgTransito: Math.round(kgTransito),
    kgOutros: Math.round(kgOutros),
    kgPortao: Math.round(kgVenda + kgTransito + kgOutros),
    valorVenda: Math.round(valorVenda * 100) / 100,
    precoPorKg: kgVenda > 0 ? Math.round((valorVenda / kgVenda) * 100) / 100 : 0,
    porCfop,
  };
}

/** Série mensal, do mês mais antigo até o último mês FECHADO. */
export async function serieNFeSaida(mesesAtras = 14) {
  const hoje = new Date();
  const saida = [];
  for (let i = mesesAtras; i >= 1; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    saida.push(await nfeSaidaDoMes(d.getFullYear(), d.getMonth() + 1));
  }
  return saida;
}
