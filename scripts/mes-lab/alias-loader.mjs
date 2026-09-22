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
import { pathToFileURL, fileURLToPath } from "url";

const RAIZ = process.cwd();

/** O arquivo que um caminho sem extensão quer dizer — a mesma ordem que o bundler tenta. */
function arquivoDe(base) {
  for (const tentativa of [base, `${base}.js`, `${base}.mjs`, `${base}.jsx`, path.join(base, "index.js")]) {
    if (fs.existsSync(tentativa) && fs.statSync(tentativa).isFile()) return tentativa;
  }
  return null;
}

// ⚠ `server-only` é um marcador do Next: existir no import basta para o bundler recusar o módulo no
// cliente. Fora do Next o pacote não resolve e derruba o script — então vira um módulo vazio. Isso
// NÃO afrouxa nada: o marcador continua no arquivo e continua valendo no build de verdade.
const VAZIO = "data:text/javascript,export default {};";

export function resolve(especificador, contexto, proximo) {
  if (especificador === "server-only") return { url: VAZIO, shortCircuit: true };
  if (especificador.startsWith("@/")) {
    const alvo = arquivoDe(path.join(RAIZ, especificador.slice(2)));
    if (alvo) return proximo(pathToFileURL(alvo).href, contexto);
  }
  // ⚠ O CLIENTE PRÓPRIO DO MES mora em `node_modules/.prisma/mes-client`, e `.prisma/...` não é
  // nome de pacote válido para o ESM do node (o bundler resolve; o node recusa). Sem isto,
  // qualquer script que importe `lib/mes/prisma.js` morre antes de rodar.
  if (especificador.startsWith(".prisma/")) {
    const alvo = arquivoDe(path.join(RAIZ, "node_modules", especificador));
    if (alvo) return proximo(pathToFileURL(alvo).href, contexto);
  }
  // ⚠⚠ RELATIVO SEM EXTENSÃO TAMBÉM PRECISA DISTO (22/09/2026). O bundler aceita
  // `import "./montagem-capacidade"`; o ESM do node, não — e `lib/postos-operador.js` passou a
  // usar essa forma, derrubando qualquer script que importasse a lista de bancadas com um
  // `ERR_MODULE_NOT_FOUND` que parecia arquivo faltando. Resolver só o `@/` era meia solução:
  // basta um módulo do projeto importar o vizinho sem `.js` para o alias não bastar.
  if (especificador.startsWith(".") && contexto.parentURL?.startsWith("file:")) {
    const base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
    if (!path.extname(base)) {
      const alvo = arquivoDe(base);
      if (alvo) return proximo(pathToFileURL(alvo).href, contexto);
    }
  }
  return proximo(especificador, contexto);
}
