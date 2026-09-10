// A TRAVA DO LABORATÓRIO — o que impede o importador de escrever em produção.
//
// ⚠⚠ ORIGEM E DESTINO VÊM DE VARIÁVEIS DIFERENTES, DE PROPÓSITO. A origem é `DATABASE_URL` (o Neon
// de produção, lido e nunca escrito); o destino é `MES_LAB_URL`, e SÓ ela. Se o destino também
// saísse de `DATABASE_URL`, bastaria esquecer de exportar a variável para o script despejar dado de
// demonstração — com nome de operador real — dentro da operação. Aqui, esquecer a variável não faz
// nada acontecer: o script para na primeira linha.
//
// ⚠ E não basta serem variáveis diferentes: alguém pode apontar `MES_LAB_URL` para o Neon, por
// copiar e colar. Por isso o destino é VALIDADO — tem que ser um Postgres na própria máquina.
//
// Ver `docs/mes-proprio.md` §7.4: o laboratório precisa de dado realista, e dado realista aqui
// inclui nome de gente que trabalha na fábrica. Isso fica na máquina do desenvolvedor.

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Devolve a URL do laboratório, ou explica por que se recusa a continuar.
 *
 * @param {string|undefined} url normalmente `process.env.MES_LAB_URL`
 * @returns {string}
 */
export function exigirLaboratorio(url) {
  if (!url) {
    throw new Error(
      "MES_LAB_URL não está definida. O destino do import é o banco LOCAL do laboratório — ele " +
      "nunca é herdado de DATABASE_URL. Ex.: MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab",
    );
  }

  let alvo;
  try {
    alvo = new URL(url);
  } catch {
    throw new Error(`MES_LAB_URL não é uma URL válida: ${String(url).slice(0, 40)}…`);
  }

  if (!LOCAIS.has(alvo.hostname)) {
    throw new Error(
      `MES_LAB_URL aponta para "${alvo.hostname}", que não é esta máquina. O laboratório é um ` +
      "Postgres LOCAL — importar para qualquer outro host escreveria dado de demonstração, com " +
      "nomes reais de operadores, num banco compartilhado.",
    );
  }

  return url;
}

/**
 * A origem: produção, e SOMENTE LEITURA.
 *
 * ⚠ Não há como pedir "conexão só de leitura" ao Prisma — a garantia é de disciplina: este módulo
 * existe para que o importador jamais construa um cliente de escrita apontando para cá. Todo
 * `create`/`update`/`delete` do importador usa o cliente do laboratório, que a trava acima validou.
 */
export function exigirOrigem(url) {
  if (!url) throw new Error("DATABASE_URL não está definida — é de onde o import LÊ (produção).");
  return url;
}
