// AS PEÇAS DE UM LOTE LIBERADO — pelo id, e pela MARCA quando o id morre.
//
// ⚠⚠ `LiberacaoProducao.pecaIds` é Json sem chave estrangeira: quando a lista da obra é
// reimportada, as peças são apagadas e recriadas com id novo, e o lote fica apontando para peça que
// não existe mais. Em 04/09/2026 eram **275 ponteiros mortos em 11 lotes** — a OP-113 com 254 de
// 260 (98%). O lote continua no banco dizendo "soltei 358 peças", e o PCP abre a obra e não vê
// nenhuma delas: o recorte que o Planejamento fez evapora e ninguém é avisado.
//
// A marca não morre: `PecaConjunto` tem `@@unique([opNumero, marca])`, e a reimportação recria a
// mesma marca sob o mesmo opNumero. Por isso a liberação passa a guardar TAMBÉM a chave natural, e
// o lote se resolve por id OU por marca — o que sobreviver.
//
// ⚠ A chave é (opNumero, marca), nunca a marca sozinha: a mesma marca se repete entre sub-obras da
// mesma OP com perfil diferente (ver [[torg_marca_nao_unica]]), e casar só por marca traria peça de
// outra frente para dentro do lote.

/** A chave natural de uma peça: "T113A|P74". */
export const chaveDaPeca = (p) =>
  `${String(p?.opNumero || "").trim()}|${String(p?.marca || "").trim().toUpperCase()}`;

/** As chaves de uma lista de peças, prontas para gravar em `pecaMarcas`. */
export const chavesDasPecas = (pecas = []) => [...new Set(pecas.map(chaveDaPeca))];

/**
 * Resolve os lotes contra as peças que existem HOJE.
 *
 * Devolve `{ ids, mortos, recuperados }`:
 *  - `ids`      — Set com os ids atuais das peças do lote (achados pelo id ou pela marca);
 *  - `mortos`   — ponteiros que não existem mais e que a marca também não recuperou;
 *  - `recuperados` — quantos foram salvos pela marca (é o que mede se isto está funcionando).
 */
export function pecasDosLotes(libs = [], pecas = []) {
  const porId = new Set(pecas.map((p) => p.id));
  const porChave = new Map(pecas.map((p) => [chaveDaPeca(p), p.id]));

  const ids = new Set();
  let mortos = 0, recuperados = 0;

  for (const l of libs) {
    const listaIds = Array.isArray(l?.pecaIds) ? l.pecaIds : [];
    const listaChaves = Array.isArray(l?.pecaMarcas) ? l.pecaMarcas : [];
    for (const id of listaIds) {
      if (porId.has(id)) { ids.add(id); continue; }
      mortos++;
    }
    // ⚠ as chaves entram sempre, não só quando o id morre: lote antigo pode ter id vivo e chave
    // ausente, e lote novo pode ter a peça recriada com id diferente do que ficou gravado.
    for (const ch of listaChaves) {
      const id = porChave.get(ch);
      if (!id) continue;
      if (!ids.has(id)) recuperados++;
      ids.add(id);
    }
  }
  // o que a marca recuperou deixa de ser perda
  return { ids, mortos: Math.max(0, mortos - recuperados), recuperados };
}
