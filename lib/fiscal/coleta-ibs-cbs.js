// ─── COLETA DAS REGRAS DE IBS/CBS NO OMIE ────────────────────────────────────
//
// Lê as NF-e de SAÍDA (`produtos/nfconsultar` → `ListarNF`) e grava em `FiscalRegraIbsCbs` o que
// `lib/fiscal/regras-ibs-cbs.js` extrai delas.
//
// ⚠⚠ COLETA PARCIAL NÃO É GRAVADA. Qualquer página que falhe derruba a coleta inteira: gravar metade
// do mês seria dizer que a outra metade não usou regra nenhuma.
//
// ⚠⚠ SÓ EXISTE RECONSTRUÇÃO — nunca soma incremental (achado do Codex, 28/09/2026). Existia uma
// gravação que SOMAVA a janela de ontem às regras gravadas; como a reconstrução já contava até hoje,
// as notas de ontem entravam duas vezes no dia seguinte, e três se o cron rodasse de novo. Agora o
// cron e o botão fazem a mesma coisa: coletam o ano e trocam a tabela numa transação. Repetir é
// inofensivo, e custa ~1 chamada ao Omie por mês do ano (484 NF em 26/09/2026).
import { extrairRegrasDaNf, agruparRegras, situacaoDaRegra } from "./regras-ibs-cbs";

const URL = "https://app.omie.com.br/api/v1/produtos/nfconsultar/";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function listarOmie(param, tentativa = 0) {
  const { OMIE_APP_KEY: app_key, OMIE_APP_SECRET: app_secret } = process.env;
  if (!app_key || !app_secret) throw new Error("Credenciais Omie não configuradas (OMIE_APP_KEY/OMIE_APP_SECRET).");
  const resp = await fetch(URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call: "ListarNF", app_key, app_secret, param: [param] }),
  });
  // ⚠⚠ Falha de transporte é ERRO, nunca "{}" (achado do Codex, 28/09/2026): `{}` passava por coleta
  // vazia e a reconstrução apagava a tabela. ⚠ O Omie devolve as falhas de negócio (inclusive "não
  // existem registros") com HTTP 500 e JSON com `faultstring` — por isso o status só decide quando
  // não há `faultstring` para ler.
  const texto = await resp.text();
  let d;
  try { d = JSON.parse(texto); } catch { throw new Error(`Omie ListarNF: resposta não é JSON (HTTP ${resp.status}).`); }
  if (!resp.ok && !d?.faultstring) throw new Error(`Omie ListarNF: HTTP ${resp.status}.`);
  // ⚠ o Omie estrangula por consumo — sem o backoff, uma janela longa morre no meio.
  if (d?.faultstring && /consumo|processadas|aguarde|timeout/i.test(d.faultstring) && tentativa < 5) {
    await espera(2000 * (tentativa + 1));
    return listarOmie(param, tentativa + 1);
  }
  return d;
}

/** As regras de uma janela de emissão (datas "dd/mm/aaaa"). Lança se qualquer página falhar. */
export async function coletarRegrasIbsCbs({ de, ate, listar = listarOmie }) {
  const obs = [];
  let notas = 0, pagina = 1, total = 1;
  while (pagina <= total) {
    const d = await listar({ pagina, registros_por_pagina: 50, apenas_importado_api: "N",
      dEmiInicial: de, dEmiFinal: ate, tpNF: 1, tpAmb: 1 });
    if (d?.faultstring) {
      // ⚠ janela sem nota devolve ERRO no Omie, não lista vazia — é zero, não falha.
      if (pagina === 1 && /n[ãa]o existem registros|nenhum/i.test(d.faultstring)) break;
      throw new Error(`Omie ListarNF: ${d.faultstring}`);
    }
    // ⚠ Sem a lista, a página não diz "nenhuma nota" — diz que algo veio errado.
    if (!Array.isArray(d?.nfCadastro)) throw new Error("Omie ListarNF: resposta inesperada (sem nfCadastro).");
    // ⚠ Paginação ausente ou inválida é falha, nunca "uma página só" (Codex, rodada 2): com `|| 1`, a
    // coleta parava cedo e a reconstrução trocava o ano inteiro por metade dele. E o total não pode
    // mudar no meio — notas entrando ou saindo durante a leitura deslocam as páginas.
    const t = d.total_de_paginas;
    if (!Number.isInteger(t) || t < 1) throw new Error(`Omie ListarNF: total_de_paginas inválido (${JSON.stringify(t)}).`);
    if (pagina > 1 && t !== total) throw new Error(`Omie ListarNF: total_de_paginas mudou de ${total} para ${t} no meio da coleta.`);
    total = t;
    for (const nf of d.nfCadastro) { notas++; obs.push(...extrairRegrasDaNf(nf)); }
    pagina++;
  }
  return { notas, regras: agruparRegras(obs) };
}

// ⚠ Statement CONSTANTE + arrays-literais de texto com cast no SQL (regra de bulk write do CLAUDE.md:
// SQL com valores inline vira um plano cacheado por chamada e estoura a memória do Neon).
const lit = (arr) => `{${arr.map((v) => (v == null ? "NULL" : `"${String(v).replace(/["\\]/g, "\\$&")}"`)).join(",")}}`;

const SQL_GRAVAR = `
  INSERT INTO "FiscalRegraIbsCbs" ("id","ncm","cfop","pCbs","pIbsUf","qtdNotas","primeiraNf","primeiraEm","ultimaNf","ultimaEm","atualizadoEm")
  SELECT md5(random()::text || clock_timestamp()::text || u.ncm || u.cfop), u.ncm, u.cfop, u.pcbs::float8, u.pibs::float8,
         u.qtd::int, u.pnf, u.pem, u.unf, u.uem, now()
  FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
    AS u(ncm, cfop, pcbs, pibs, qtd, pnf, pem, unf, uem)
  ON CONFLICT ("ncm","cfop","pCbs","pIbsUf") DO UPDATE SET
    "qtdNotas" = EXCLUDED."qtdNotas", "primeiraNf" = EXCLUDED."primeiraNf", "primeiraEm" = EXCLUDED."primeiraEm",
    "ultimaNf" = EXCLUDED."ultimaNf", "ultimaEm" = EXCLUDED."ultimaEm", "atualizadoEm" = now()`;

const argsGravar = (regras) => {
  const col = (k) => lit(regras.map((r) => r[k]));
  return [col("ncm"), col("cfop"), col("pCbs"), col("pIbsUf"), col("qtdNotas"),
    col("primeiraNf"), col("primeiraEm"), col("ultimaNf"), col("ultimaEm")];
};

const br = (a, m, d) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;

/**
 * Reconstrói TUDO de 01/01 do ano até hoje: coleta mês a mês e só então troca a tabela inteira,
 * numa transação. ⚠ Coleta que falha em qualquer mês não apaga nada.
 */
export async function reconstruirRegras({ hoje = new Date(), db, listar }) {
  const ano = hoje.getFullYear();
  const obs = [];
  let notas = 0;
  for (let m = 1; m <= hoje.getMonth() + 1; m++) {
    const ultimo = m === hoje.getMonth() + 1 ? hoje.getDate() : new Date(ano, m, 0).getDate();
    const r = await coletarRegrasIbsCbs({ de: br(ano, m, 1), ate: br(ano, m, ultimo), listar });
    notas += r.notas;
    // reagrupar no fim: a mesma regra em meses diferentes é UMA linha
    obs.push(...r.regras.flatMap((g) => [
      { ncm: g.ncm, cfop: g.cfop, pCbs: g.pCbs, pIbsUf: g.pIbsUf, nf: g.primeiraNf, emitidaEm: g.primeiraEm, _qtd: g.qtdNotas },
      { ncm: g.ncm, cfop: g.cfop, pCbs: g.pCbs, pIbsUf: g.pIbsUf, nf: g.ultimaNf, emitidaEm: g.ultimaEm, _qtd: 0 },
    ]));
  }
  const regras = somarMeses(obs);
  await db.$transaction([
    db.$executeRawUnsafe(`DELETE FROM "FiscalRegraIbsCbs"`),
    ...(regras.length ? [db.$executeRawUnsafe(SQL_GRAVAR, ...argsGravar(regras))] : []),
  ]);
  return { notas, regras: regras.length };
}

/** Junta os agrupamentos de cada mês: soma as notas e alarga primeira/última. */
function somarMeses(obs) {
  const mapa = new Map();
  for (const o of obs) {
    const chave = [o.ncm, o.cfop, o.pCbs, o.pIbsUf].join("|");
    const g = mapa.get(chave) ?? { ncm: o.ncm, cfop: o.cfop, pCbs: o.pCbs, pIbsUf: o.pIbsUf, qtdNotas: 0,
      primeiraNf: o.nf, primeiraEm: o.emitidaEm, ultimaNf: o.nf, ultimaEm: o.emitidaEm };
    g.qtdNotas += o._qtd;
    if (o.emitidaEm < g.primeiraEm) { g.primeiraEm = o.emitidaEm; g.primeiraNf = o.nf; }
    if (o.emitidaEm > g.ultimaEm) { g.ultimaEm = o.emitidaEm; g.ultimaNf = o.nf; }
    mapa.set(chave, g);
  }
  return [...mapa.values()];
}

/** O que as nossas notas dizem para este NCM × CFOP. */
export async function regraIbsCbs({ ncm, cfop }, db) {
  const n = String(ncm ?? "").replace(/\D/g, "");
  const c = String(cfop ?? "").replace(/\D/g, "");
  if (n.length !== 8 || c.length !== 4) return situacaoDaRegra([]);
  const linhas = await db.fiscalRegraIbsCbs.findMany({ where: { ncm: n, cfop: c }, orderBy: { ultimaEm: "desc" } });
  return situacaoDaRegra(linhas);
}
