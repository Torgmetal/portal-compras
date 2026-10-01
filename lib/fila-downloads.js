// ─── BAIXAR VÁRIOS AO MESMO TEMPO, ENTREGAR NA ORDEM ─────────────────────────
// O data book da OP-112 dava 504 (Geraldo, 30/09/2026): 264 anexos vinham do SharePoint UM POR
// VEZ e estouravam a função. Medido no Mac: 55 s em sequência, 9 s com 10 no ar — e montar o PDF
// com eles leva menos de 1,5 s. O tempo inteiro era espera de rede; na Vercel, que roda nos EUA
// com o banco e o SharePoint no Brasil, cada ida e volta custa ainda mais.
//
// ⚠⚠ A ORDEM DE CONSUMO É A ORDEM DO LIVRO. O download termina na ordem que a rede quiser, mas o
// anexo entra no PDF na posição dele — por isso a fila guarda as promessas NA ORDEM e só entrega a
// seguinte depois da anterior.
//
// ⚠ JANELA, NÃO "TUDO DE UMA VEZ": no máximo `janela` arquivos baixados e ainda não usados. Sem
// isso, 264 downloads simultâneos seguram 86 MB em memória ao mesmo tempo e convidam o SharePoint
// a responder 429. A janela anda conforme o livro consome.

/**
 * @template T, R
 * @param {T[]} itens na ORDEM em que serão consumidos
 * @param {(item: T) => Promise<R>} baixar
 * @param {{ janela?: number, chave?: (item: T) => unknown }} [opts]
 *   `chave` identifica o item quando quem consome passa OUTRA instância do mesmo documento
 *   (o livro copia o documento ao juntar a ficha do CMR).
 * @returns {{ proximo(item: T): Promise<{ valor?: R, erro?: unknown }> }}
 */
export function filaDeDownloads(itens, baixar, { janela = 8, chave = (x) => x } = {}) {
  const noAr = []; // { k, p } na ordem dos itens
  let seguinte = 0;
  let desligada = false;

  // ⚠ o erro é capturado AQUI, na hora: promessa rejeitada que ninguém aguarda derruba o processo
  // (unhandledRejection). Quem consome recebe { erro } e decide — no livro, vira pendência.
  const embrulhar = (item) => {
    let p;
    try { p = Promise.resolve(baixar(item)); } catch (erro) { p = Promise.reject(erro); }
    return p.then((valor) => ({ valor }), (erro) => ({ erro }));
  };

  const encher = () => {
    while (!desligada && noAr.length < janela && seguinte < itens.length) {
      const item = itens[seguinte++];
      noAr.push({ k: chave(item), p: embrulhar(item) });
    }
  };
  // começa já: enquanto o livro desenha capa, sumário e listas, os anexos vão chegando
  encher();

  return {
    proximo(item) {
      const vez = noAr.shift();
      // ⚠ a vaga só reabre quando ESTE termina: repor antes deixaria janela+1 no ar
      if (vez && vez.k === chave(item)) return vez.p.then((r) => { encher(); return r; });
      // ⚠⚠ CONSUMO FORA DA ORDEM PREVISTA: a fila deixa de adivinhar e cada um baixa o seu. Ficar
      // lento é aceitável; entregar o arquivo de outro anexo, não — ele entraria no livro no lugar
      // errado sem ninguém perceber.
      desligada = true;
      noAr.length = 0;
      return embrulhar(item);
    },
  };
}

// HTTP 429 é o SharePoint pedindo para esperar; 502/503/504 e queda de rede são passageiros.
// 404, 403 ou arquivo que não é PDF não melhoram com insistência.
const PASSAGEIRO = /\bHTTP (?:429|502|503|504)\b|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i;

/**
 * Repete `fn` quando o erro é passageiro, com espera crescente.
 *
 * ⚠ NÃO DORME ALÉM DE `ateMs`: uma espera que passa do prazo da função só troca o erro claro do
 * anexo pelo 504 genérico do livro inteiro.
 *
 * @template R
 * @param {() => Promise<R>} fn
 * @param {{ tentativas?: number, esperaMs?: number, ateMs?: number }} [opts]
 * @returns {Promise<R>}
 */
export async function comNovaTentativa(fn, { tentativas = 3, esperaMs = 1500, ateMs = Infinity } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const espera = esperaMs * i;
      if (i >= tentativas || !PASSAGEIRO.test(String(e?.message || e)) || Date.now() + espera > ateMs) throw e;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}
