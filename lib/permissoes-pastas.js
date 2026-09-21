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
 * A OP foi excluída à mão do escopo?
 *
 * ⚠⚠ EXISTE POR CAUSA DA `OP-000 - PADRÃO`, o molde copiado para criar toda OP nova. Ela aparece
 * na varredura como qualquer outra e quase nunca deve receber a permissão junto — conceder ali não
 * faz OP nova nascer liberada (cópia no SharePoint herda do destino), só suja o molde.
 *
 * ⚠ Mesma regra de fronteira do `casaOp`, e pela mesma razão: `--exceto=OP-1` não pode engolir
 * OP-10 e OP-100.
 */
export const opExcluida = (nome, excecoes) =>
  (excecoes || []).some((e) => casaOp(nome, e));

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

// ─── CONCEDER (o inverso do remover) ──────────────────────────────────────────
//
// Matheus (16/09/2026): "igual foi feito com o usuário do Leandro para remover, mas agora
// adicionar o do Geraldo da Qualidade" nas pastas Comercial de todas as OPs.
//
// ⚠⚠ CONCEDER NÃO É REMOVER DE TRÁS PARA A FRENTE, e a diferença que importa é o alvo: a remoção
// procura quem JÁ ESTÁ na ACL de cada pasta (o nome casou lá dentro), enquanto a concessão precisa
// resolver a pessoa ANTES, contra o diretório do site — ela justamente não está nas pastas. Por
// isso o alvo vem do e-mail, que é único, e não de um trecho de nome, que casaria dois Geraldos.

/**
 * Os papéis que a concessão aceita, do menor privilégio para o maior.
 *
 * ⚠⚠ "EDITAR" NÃO É SINÔNIMO DE "COLABORAÇÃO", E EU TINHA POSTO OS DOIS NA MESMA LISTA. No
 * SharePoint, Colaboração/Contribute é acrescentar, alterar e excluir ITENS; Editar/Edit é isso
 * MAIS gerenciar a própria lista (criar e apagar colunas, apagar a lista). O ensaio de 16/09/2026
 * resolveu "Editar (id 1073741830)" para um pedido de igualar a Colaboração que o Geraldo já tinha
 * numa pasta — daria mais poder do que ele tem hoje, em 25 pastas, sem ninguém notar.
 *
 * ⚠ Por isso cada papel casa só os nomes DELE, e "Editar" tem entrada própria. Nome de papel é
 * traduzido pelo idioma do site, mas tradução aproximada não pode virar promoção de privilégio.
 */
export const PAPEIS = {
  leitura: { rotulo: "Leitura", nomes: ["Leitura", "Read"] },
  colaboracao: { rotulo: "Colaboração", nomes: ["Colaboração", "Colaboracao", "Contribute"] },
  edicao: { rotulo: "Editar", nomes: ["Editar", "Edit"] },
};

/**
 * Acha o id da definição de papel no site.
 *
 * ⚠ O NOME DO PAPEL MUDA COM O IDIOMA DO SITE ("Leitura" x "Read"), e o id muda por site — não dá
 * para chumbar 1073741826 e torcer. Casa por qualquer um dos nomes conhecidos.
 */
export function acharRoleDefId(definicoes, papel) {
  const cfg = PAPEIS[papel];
  if (!cfg) return { erro: `papel desconhecido: ${papel}` };
  const alvo = cfg.nomes.map(normalizar);
  const achado = (definicoes || []).find((d) => alvo.includes(normalizar(d.Name)));
  if (!achado) {
    return { erro: `o site não tem o papel "${cfg.rotulo}" (tem: ${(definicoes || []).map((d) => d.Name).join(", ")})` };
  }
  return { id: achado.Id, nome: achado.Name };
}

/**
 * A pessoa já tem acesso REAL a esta pasta?
 *
 * ⚠⚠ "ACESSO LIMITADO" NÃO CONTA COMO TER — é o marcador de passagem que o SharePoint cria sozinho
 * para alcançar um item permitido lá embaixo. Tratá-lo como acesso faria a concessão pular
 * justamente as pastas onde a pessoa só tem passagem e nenhum direito de abrir nada.
 */
export const jaTemAcesso = (mapa, pidCru) => Boolean(mapa?.[String(pidCru)]?.real);

/**
 * A concessão deu certo?
 *
 * ⚠ Mesmo cuidado do `avaliarResultado`: ninguém mais pode ter ganhado ou perdido papel real. A
 * quebra de herança copia a ACL inteira (`copyRoleAssignments=true`), então o esperado é que os
 * demais fiquem exatamente como estavam — e o alvo apareça com papel real.
 */
export function avaliarConcessao(antes, depois, pidCru) {
  const pid = String(pidCru);
  const comReal = (mapa) => Object.keys(mapa).filter((k) => mapa[k]?.real);
  const entrou = Boolean(depois[pid]?.real);
  const perdidos = comReal(antes)
    .filter((k) => k !== pid)
    .filter((k) => !depois[k] || depois[k].real !== antes[k].real)
    .map((k) => antes[k].titulo);
  const novos = comReal(depois).filter((k) => k !== pid && !antes[k]?.real).map((k) => depois[k].titulo);
  return { ok: entrou && !perdidos.length && !novos.length, entrou, perdidos, novos };
}
