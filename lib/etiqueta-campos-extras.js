// Os campos que só o modelo de etiqueta do cliente pede — referência do desenho, TAG Petrobras e a
// posição ("SE-001"). Vêm da planilha "Lista Equivalência de Marcas" (QWS/Petrobras, OP-102) e não
// existem no cadastro de peças.
//
// ⚠⚠ SEPARADO DE `PecaConjunto` DE PROPÓSITO. Não é dado de fabricação — é o formulário do cliente
// final. Em coluna nova na tabela de peças, todo cliente novo com essa exigência somaria mais
// colunas numa tabela que já tem setenta, e nenhum outro fluxo do portal leria nenhuma delas. E não
// caberia: aqui há uma linha POR UNIDADE, e `PecaConjunto` tem uma linha por marca.
//
// ⚠ A chave é (opNumero, marca, unidade), a mesma marca do histórico de impressão: o id de
// `PecaConjunto` não sobrevive a uma reimportação da Lista de Expedição, a marca sim.

const chave = (marca) => String(marca ?? "").trim().toUpperCase();

/**
 * Os campos extras da obra: para cada marca, as unidades em ordem (1ª, 2ª, 3ª…).
 * @returns {Promise<Map<string, Array<{unidade:number, descricao:string|null, referencia:string|null, tagPetrobras:string|null}>>>}
 */
export async function camposExtrasDaOP(prisma, opNumero) {
  const linhas = await prisma.etiquetaCampoExtra.findMany({
    where: { opNumero: String(opNumero) },
    select: { marca: true, unidade: true, descricao: true, referencia: true, tagPetrobras: true },
    orderBy: [{ marca: "asc" }, { unidade: "asc" }],
  });
  const porMarca = new Map();
  for (const l of linhas) {
    const k = chave(l.marca);
    if (!porMarca.has(k)) porMarca.set(k, []);
    porMarca.get(k).push(l);
  }
  return porMarca;
}

/**
 * Cola as unidades nas peças, sem inventar o que não veio.
 *
 * ⚠ `unidadesQws` e não `descricao`/`referencia` soltos na peça: a peça é UMA linha e as unidades
 * são VÁRIAS. Achatar aqui obrigaria a etiqueta a adivinhar qual das três TAGs é a dela.
 */
export function juntarCamposExtras(pecas, extras) {
  return pecas.map((p) => {
    const u = extras.get(chave(p.marca));
    return u?.length ? { ...p, unidadesQws: u } : p;
  });
}

/**
 * Os campos da N-ésima etiqueta de uma marca.
 *
 * ⚠ SEM UNIDADE CORRESPONDENTE, CAI NA PRIMEIRA — e não em branco. Acontece quando o cadastro tem
 * mais peças que a planilha do cliente (a L.E. do portal está numa revisão, a lista do cliente em
 * outra). Etiqueta com a TAG da unidade errada é problema; etiqueta em branco também, e essa o
 * pátio descobre só na hora de colar.
 */
export function unidadeDaEtiqueta(peca, indice) {
  const u = peca?.unidadesQws;
  if (!u?.length) return {};
  return u[indice - 1] || u[0];
}

/**
 * Grava a planilha parseada, uma linha por unidade. Devolve quantas entraram e quantas mudaram.
 *
 * ⚠ UPSERT, NÃO "APAGA E GRAVA". Uma planilha parcial (o cliente mandou só as marcas novas) não
 * pode fazer sumir a TAG das marcas que já estavam lá — a etiqueta delas passaria a sair com "—"
 * sem ninguém perceber até a peça chegar no cliente.
 */
export async function salvarCamposExtras(prisma, opNumero, unidades) {
  const op = String(opNumero);
  let criados = 0, atualizados = 0;
  for (const u of unidades) {
    const dados = { descricao: u.descricao, referencia: u.referencia, tagPetrobras: u.tagPetrobras };
    const r = await prisma.etiquetaCampoExtra.upsert({
      where: { opNumero_marca_unidade: { opNumero: op, marca: u.marca, unidade: u.unidade } },
      create: { opNumero: op, marca: u.marca, unidade: u.unidade, ...dados },
      update: dados,
      select: { criadoEm: true, atualizadoEm: true },
    });
    if (+r.criadoEm === +r.atualizadoEm) criados++; else atualizados++;
  }
  return { criados, atualizados };
}

// ─── A TAG DO CLIENTE NO MODELO PADRÃO (TMSA, 14/09/2026) ────────────────────

/**
 * As TAGs da obra, por marca, indexadas pela UNIDADE.
 *
 * ⚠⚠ MAPA POR UNIDADE, NÃO ARRAY POSICIONAL (achado do Codex). O array do QWS é lido por POSIÇÃO
 * (`u[indice - 1]`) e só funciona porque aquelas linhas vêm todas da mesma planilha, sem buracos.
 * Aqui as linhas convivem na mesma tabela com as do QWS e podem ter lacunas — a unidade 3 pode
 * existir sem a 2. Lido por posição, a unidade 3 sairia com a TAG da 2.
 */
export function tagsPorUnidade(linhas) {
  const porMarca = new Map();
  for (const l of linhas) {
    const k = chave(l.marca);
    if (!porMarca.has(k)) porMarca.set(k, new Map());
    porMarca.get(k).set(Number(l.unidade), l.tag);
  }
  return porMarca;
}

/** Cola o mapa de TAGs em cada peça. */
export function juntarTagsCliente(pecas, porMarca) {
  return pecas.map((p) => {
    const m = porMarca.get(chave(p.marca));
    return m?.size ? { ...p, tagsUnidade: m } : p;
  });
}

/**
 * A TAG da N-ésima etiqueta desta marca — ou `null`.
 *
 * ⚠⚠ SEM FALLBACK, AO CONTRÁRIO DO QWS (pedido do Codex). Lá, cair na primeira unidade é o menor
 * mal: o campo é informativo. Aqui a TAG é o DESTINO da peça — herdar a de outra unidade manda a
 * peça para o transportador errado, e isso o pátio não descobre. Sem correspondência, sai sem
 * prefixo: a etiqueta continua válida e a falta aparece na conferência de cobertura, antes de
 * imprimir.
 *
 * ⚠⚠ NA CAIXA, SÓ SE TODAS AS UNIDADES FOREM DA MESMA TAG. A etiqueta única representa o lote
 * inteiro e sai com `indice = total`; pegar a TAG da última unidade carimbaria a caixa toda com o
 * destino de UMA peça. Com destinos misturados ela sai sem prefixo — e a tela avisa.
 */
export function tagDaEtiqueta(peca, indice) {
  const m = peca?.tagsUnidade;
  if (!m?.size) return null;
  if (peca.emCaixa) {
    const todas = new Set(m.values());
    const total = Math.max(1, Number(peca.qte) || 1);
    return todas.size === 1 && m.size >= total ? [...todas][0] : null;
  }
  return m.get(Number(indice)) ?? null;
}

/**
 * A DESCRIÇÃO COM A TAG DO CLIENTE NA FRENTE.
 *
 * Matheus (14/09/2026): *"essas TAGs têm que sair na frente da descrição de cada MARCA"* — e
 * *"tem que ser no nosso modelo, só acrescentar a TAG na frente. MODELO TORG"*.
 *
 * ⚠⚠ A TAG É DA PEÇA, NÃO DA MARCA: `tagDaEtiqueta` procura pela UNIDADE desta etiqueta. Das 4
 * peças da `105A3`, duas vão para o TC 4706 e duas para o TC 4707 — a etiqueta 1/4 e a 3/4 saem
 * com destinos diferentes.
 *
 * ⚠ SEPARADOR ` | `, NÃO HÍFEN. Mesma lição da TAG da obra e da marca/posição do QWS: o hífen funde
 * dois códigos de origens diferentes num terceiro que não existe em lugar nenhum.
 *
 * ⚠ Sem TAG para esta unidade, sai só a descrição — nunca a TAG de outra peça.
 */
export const descricaoComTag = (peca, indice) => {
  const desc = String(peca.descricao || "").toUpperCase();
  const tag = tagDaEtiqueta(peca, indice);
  return tag ? `${desc} - ${String(tag).toUpperCase()}` : desc;
};
