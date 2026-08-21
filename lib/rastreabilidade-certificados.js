import "server-only";
import { listChildrenByPath } from "./sharepoint";
import { resolveServidorDriveId } from "./projetos-databook";
import { parseIndicesDoNome } from "./match-certificados";

// ÍNDICE VIVO DOS CERTIFICADOS — varre a árvore inteira de Rastreabilidade, por R.
//
// Vitor (19/08/2026): "preciso ficar anexando a pasta de rastreabilidade e atualizando na aba
// rastreabilidade, queria tirar isso. Quero algo dinâmico, e sempre que abro essa tela ficam
// justamente os certificados que faltam alguma coisa".
//
// Por que "sempre falta alguma coisa": o casamento antigo lia UMA pasta só —
// `Certificados 2026/Certificados Digitalizados`, 822 arquivos. Só que os certificados estão
// espalhados em sete lugares dentro de `01. Rastreabilidade`:
//
//   Certificados 2024/…            Certificados 2025/Cert. OP 050, OP 060, OP 068…
//   Certificados 2026/Certificados Digitalizados · Arquivo Certf · CERTIFICADOS OP82,83,84,88
//   CERTIFICADOS OP 102 · CERTIFICADOS QWS · Certificados TMSA   (soltos na raiz)
//
// Resultado: 2.897 dos 3.705 documentos do CMR (78%) apareciam "sem certificado" — a maioria
// porque o arquivo existe, só não estava na pasta que o portal olhava. Daí o trabalho manual de
// reapontar a pasta a cada obra.
//
// 🚫 OBSOLETO fica de fora. É onde vai o que foi substituído; casar com ele anexaria certificado
// vencido ou revisado num data book, que é o oposto do que a pasta existe pra evitar.
//
// ⚠ VARRER CUSTA. São ~1.000 arquivos em dezenas de pastas, e o Graph cobra uma chamada por
// nível. Por isso há cache em memória: a tela abre no índice pronto e só revarre quando o cache
// expira (ou quando pedirem explicitamente).

const RAIZ = "/Almoxarifado/01. Rastreabilidade";
const RX_IGNORAR = /obsolet/i;
const TTL_MS = 10 * 60 * 1000; // 10 min — a pasta muda quando o Almoxarifado digitaliza, não a cada minuto
const PROFUNDIDADE = 4;

let cache = null; // { em, indice, arquivos, pastas }

/** Varre recursivamente e devolve todos os arquivos com o caminho onde estão. */
async function varrer(driveId, path, nivel = 0, out = []) {
  if (nivel > PROFUNDIDADE) return out;
  let itens;
  try { itens = await listChildrenByPath(driveId, path); } catch { return out; }

  const subpastas = [];
  for (const x of itens) {
    if (x.folder) {
      if (RX_IGNORAR.test(x.name || "")) continue;
      subpastas.push(`${path}/${x.name}`);
    } else if (x.file) {
      out.push({
        id: x.id,
        nome: x.name,
        url: x.webUrl || null,
        pasta: path.replace(`${RAIZ}/`, "").replace(RAIZ, "") || "(raiz)",
        modificadoEm: x.lastModifiedDateTime || null,
        tamanho: x.size || null,
      });
    }
  }
  // em paralelo: a varredura é dominada por latência de rede, não por CPU
  await Promise.all(subpastas.map((p) => varrer(driveId, p, nivel + 1, out)));
  return out;
}

/**
 * Índice R → arquivo(s). Um PDF de faixa ("R 260007 á 008") atende vários R.
 * @param {boolean} forcar ignora o cache
 */
export async function indiceCertificados(forcar = false) {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache;

  const driveId = await resolveServidorDriveId();
  if (!driveId) throw new Error("Drive SERVIDOR não resolvido.");

  const arquivos = await varrer(driveId, RAIZ);
  const indice = new Map();
  for (const a of arquivos) {
    for (const r of parseIndicesDoNome(a.nome)) {
      // ⚠ o mesmo R pode existir em mais de uma pasta (redigitalizado, cópia por obra).
      // Guarda todos: a tela mostra que há duplicata em vez de escolher em silêncio.
      const lista = indice.get(r) || [];
      lista.push(a);
      indice.set(r, lista);
    }
  }

  const pastas = [...new Set(arquivos.map((a) => a.pasta))].sort();
  cache = { em: Date.now(), indice, arquivos, pastas, driveId };
  return cache;
}

/** Descarta o cache — usar depois de digitalizar certificado novo. */
export function limparCacheCertificados() {
  cache = null;
}
