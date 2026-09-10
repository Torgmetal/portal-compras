// RESOLVE `@/...` FORA DO NEXT, para scripts poderem importar `lib/` e as constantes do PCP.
//
//   node --experimental-loader ./scripts/mes-lab/alias-loader.mjs scripts/mes-lab/semear.mjs
//
// ⚠ EXISTE PARA NÃO DUPLICAR CONSTANTE. O semeio precisa da lista de recursos do Gantt
// (`app/pcp/producao/_gantt/recursos.js`) e das bancadas da solda (`lib/solda-capacidade.js`).
// Copiar essas listas para dentro do script seria plantar a segunda verdade que o próprio
// `docs/mes-proprio.md` §11.4 alerta — e a cópia começaria errada no dia em que um soldador
// mudasse de bancada.
//
// ⚠ O `@/` do projeto aponta para a RAIZ do repositório (ver jsconfig/vitest), não para `src/`.

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const RAIZ = process.cwd();

/** O arquivo que um caminho sem extensão quer dizer — a mesma ordem que o bundler tenta. */
function arquivoDe(base) {
  for (const tentativa of [base, `${base}.js`, `${base}.mjs`, `${base}.jsx`, path.join(base, "index.js")]) {
    if (fs.existsSync(tentativa) && fs.statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

export function resolve(especificador, contexto, proximo) {
  if (especificador.startsWith("@/")) {
    const alvo = arquivoDe(path.join(RAIZ, especificador.slice(2)));
    if (alvo) return proximo(pathToFileURL(alvo).href, contexto);
  }
  return proximo(especificador, contexto);
}
