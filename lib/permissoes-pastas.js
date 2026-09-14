// As decisões do ajuste de permissão em massa (scripts/permissoes-sharepoint.mjs), separadas da
// conversa com o SharePoint para poderem ser testadas sem navegador, rede nem banco.

/** Normaliza para comparar nome de pasta: sem acento, sem espaço dobrado, minúsculo. */
export const normalizar = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A pasta é uma das pedidas?
 *
 * ⚠⚠ IGUALDADE, NÃO PREFIXO. Por prefixo, "1. Comercial" casaria também "1. Comercial Antigo" —
 * e o operador só descobriria depois de tirar o acesso da pasta errada (Codex, 14/09/2026).
 */
export const casaPasta = (nome, pedidas) => pedidas.some((p) => normalizar(p) === normalizar(nome));

/**
 * A OP entra no escopo?
 *
 * ⚠⚠ `--ops=OP-1` NÃO PODE PEGAR OP-10 E OP-100. O filtro casa o nome inteiro ou um prefixo que
 * termine em fronteira (fim do texto, espaço ou hífen): "OP-1" pega "OP-1 - Cliente", não "OP-10".
 */
export const casaOp = (nome, filtro) => {
  if (!filtro) return true;
  const n = normalizar(nome);
  const f = normalizar(filtro);
  return n === f || n.startsWith(`${f} `) || n.startsWith(`${f}-`);
};

/**
 * Quem é a pessoa, entre tudo que o nome casou no levantamento inteiro.
 *
 * ⚠⚠ AMBIGUIDADE TEM QUE PARAR O LOTE, NÃO ESCOLHER O PRIMEIRO. Dois "Leandro" na empresa, ou um
 * grupo com o nome da pessoa, e o lote removeria identidades diferentes de pasta para pasta —
 * inclusive se re-executado (achado do Codex, 14/09/2026). Devolve `{ erro }` quando não dá para
 * decidir; quem chama não aplica nada.
 */
export function escolherPrincipal(achados) {
  const porId = new Map();
  for (const a of achados) {
    if (!porId.has(a.pid)) porId.set(a.pid, { pid: a.pid, titulo: a.titulo, tipo: a.tipo });
  }
  const distintos = [...porId.values()];
  if (!distintos.length) return { erro: "nenhum principal casou o nome informado" };
  if (distintos.length > 1) {
    return { erro: `o nome casou ${distintos.length} identidades diferentes: ${distintos.map((d) => `${d.titulo} (id ${d.pid})`).join(", ")}` };
  }
  const unico = distintos[0];
  if (unico.tipo !== 1) {
    return { erro: `"${unico.titulo}" não é um usuário (PrincipalType ${unico.tipo}) — remover um grupo tira o acesso de todos os membros` };
  }
  return { principal: unico };
}

/**
 * O que mudou na pasta é aceitável?
 *
 * ⚠⚠ SÓ COMPARAR QUEM TEM PAPEL REAL. "Acesso Limitado" é marcador que o SharePoint cria e recolhe
 * sozinho para dar passagem até itens permitidos abaixo: quebrar a herança levou uma pasta de 53
 * para 21 principais sem ninguém perder acesso (14/09/2026). Comparar o total acusa desastre
 * onde não houve — e um critério que grita à toa é um critério que se aprende a ignorar.
 */
export function avaliarResultado(antes, depois, pidCru) {
  // ⚠ As chaves do mapa vêm de Object.keys (string) e o PrincipalId circula como número.
  // Sem normalizar, o próprio alvo entra na lista de "perdidos" e toda pasta reprova.
  const pid = String(pidCru);
  const comReal = (mapa) => Object.keys(mapa).filter((k) => mapa[k]?.real);
  const sumiu = !depois[pid];
  const perdidos = comReal(antes)
    .filter((k) => k !== pid)
    .filter((k) => !depois[k] || depois[k].real !== antes[k].real)
    .map((k) => antes[k].titulo);
  const novos = comReal(depois).filter((k) => !antes[k]?.real).map((k) => depois[k].titulo);
  return { ok: sumiu && !perdidos.length && !novos.length, sumiu, perdidos, novos };
}
