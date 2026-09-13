// ─── O NOME DA PEÇA DENTRO DO NESTING ─────────────────────────────────────────
//
// ⚠⚠ O NOME MUDA DE PLANO PARA PLANO, E ESSA É A ÚNICA COISA ESTÁVEL. No Laser Cantoneira/Tubo a
// peça se chama `T107A-P1_8`; no Laser Perfil, `T97A5_1` — sem hífen e sem "P"; na Libellula vem
// com a pasta do projeto na frente: `T107-TMSA\T107A-P14`. A regra que vale nos três é
// "tire o caminho, tire o último `_N`" — e o resto TEM de casar EXATO com `PecaConjunto.marca`.
//
// ⚠⚠ NUNCA APROXIMAR POR SEMELHANÇA. `T107A-P1` e `T107A-P12` são peças diferentes, e um
// casamento "parecido" aqui vira baixa na marca errada — erro que só aparece no inventário, meses
// depois. O que não casar exato vira PENDÊNCIA VISÍVEL, nunca um palpite gravado.

/** `T107A-P3_10` → `{ marca: "T107A-P3", conferencia: 10 }` */
export function marcaDoNome(nome) {
  const limpo = String(nome ?? "").trim().replace(/^.*[\\/]/, "");   // tira `T107-TMSA\`
  if (!limpo) return { marca: "", conferencia: null };

  // ⚠ O sufixo `_N` é CONVENÇÃO DO PROGRAMADOR, não campo do software. Serve de conferência: se
  // discordar do `qte` do portal, ou a LPC mudou ou o nesting saiu de uma lista velha — e isso tem
  // de aparecer. Nunca como fonte da quantidade.
  const m = limpo.match(/^(.+)_(\d+)$/);
  if (!m) return { marca: limpo, conferencia: null };
  return { marca: m[1], conferencia: Number(m[2]) };
}

export const soMarca = (nome) => marcaDoNome(nome).marca;

/**
 * A OP, tirada do nome do arquivo.
 *
 * `11-09-2026 - T107A - W150X13.pdf` → `T107A` · `T107A - 9.50mm.pdf` → `T107A`
 *
 * ⚠ É PISTA, NÃO CHAVE. `opNumero` tem 90 grafias distintas no banco (o problema multi-chave do
 * CLAUDE.md), então isto serve para SUGERIR a obra na tela de importação — quem decide é o
 * casamento das marcas, que é exato.
 */
export function obraDoArquivo(nomeArquivo) {
  const base = String(nomeArquivo ?? "").replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const partes = base.split(" - ").map((p) => p.trim()).filter(Boolean);
  const achado = partes.find((p) => /^T?\d+[A-Z]?$/i.test(p) || /^T\d+[A-Z]$/i.test(p));
  return achado ? achado.toUpperCase() : null;
}
