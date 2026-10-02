import "server-only";
import { novaFolha, M, DARK, GRAY, alturaAssinaturas, alturaInstrumentos, alturaTexto, ALTURA_CABECALHO } from "./relatorio-form-pdf";

// ─── FOLHAS QUE FLUEM ────────────────────────────────────────────────────────────────────────────
//
// A verificação dos modelos (02/10/2026) achou o mesmo defeito em quase todos os relatórios: cada bloco
// tinha altura fixa e ninguém conferia o espaço antes de desenhar o seguinte. Com seis instrumentos ou
// uma assinatura desenhada, o bloco das assinaturas passava da borda do papel; as observações saíam
// cortadas em duas linhas, sem aviso. Aqui cada bloco é desenhado onde CABE, e o que não cabe abre a
// folha seguinte — nada é cortado, nada sai do papel.
//
// ⚠⚠ ASSINATURAS EM TODAS AS FOLHAS, como a pintura já faz: o espaço delas é reservado no pé de cada
// folha antes de qualquer bloco, então nenhum conteúdo chega a disputá-lo (e elas saem logo abaixo do
// conteúdo, como no modelo).
//
// ⚠⚠ O "FOLHA x DE y" SÓ SE SABE NO FIM: o cabeçalho é desenhado por último, no espaço reservado no topo.
// Antes, o total era chutado no começo e o documento dizia "1 DE 2" numa folha e "3 DE 4" na outra.

/**
 * @param {object} doc de `abrirDocumento`
 * @param {{cabecalho:object, identificacaoCurta?:(f)=>void, assinaturas:any[], papeis:string[], inspetor?:string}} opts
 *   `identificacaoCurta` é desenhada no alto das folhas de continuação, para a folha solta ainda dizer de
 *   que relatório é
 */
export function criarFluxo(doc, { cabecalho, identificacaoCurta = null, assinaturas = null, papeis, inspetor = null }) {
  const piso = M + alturaAssinaturas(assinaturas);
  const folhas = [];
  const abrir = () => {
    const f = novaFolha(doc);
    folhas.push({ f, topo: f.y });
    f.y -= ALTURA_CABECALHO;
    if (folhas.length > 1 && identificacaoCurta) identificacaoCurta(f);
    return f;
  };
  let f = abrir();

  const fluxo = {
    get f() { return f; },
    get quantas() { return folhas.length; },
    sobra: () => f.y - piso,
    cabe: (h) => f.y - h >= piso,
    novaFolha() { f = abrir(); return f; },
    /** Garante `h` pontos livres na folha atual; se não houver, continua na seguinte. */
    reservar(h) { if (!fluxo.cabe(h)) fluxo.novaFolha(); return f; },

    /**
     * Texto com rótulo numa caixa que CRESCE com ele e continua na folha seguinte se preciso — o
     * pedaço de lá sai como "(continuação)". Vazio, a caixa tem a altura do modelo, para escrever à mão.
     */
    texto(rotulo, texto, { tam = 7.5, vazio = 34 } = {}) {
      const linhas = f.linhasTexto(texto, tam);
      const alt = (n) => alturaTexto(n, vazio);
      // ⚠ o pedaço que continua TERMINA dizendo isso: quem lê a folha sozinha precisa saber que o texto
      // não acabou ali (a folha seguinte abre com "(continuação)")
      const AVISO = "(continua na folha seguinte)";
      const caixa = (rot, lns) => {
        const topo = f.bloco(alt(lns.length));
        f.rotulo(M + 7, topo - 10, rot);
        lns.forEach((ln, j) => f.page.drawText(ln, { x: M + 7, y: topo - 21 - j * 10, size: tam, font: f.font, color: ln === AVISO ? GRAY : DARK }));
      };
      if (!linhas.length) { fluxo.reservar(alt(0)); caixa(rotulo, []); return; }
      let i = 0;
      while (i < linhas.length) {
        const restam = linhas.length - i;
        const n = Math.min(restam, Math.floor((fluxo.sobra() - 18) / 10));
        // não deixa fiapo: menos de 2 linhas (quando há mais) vai inteiro para a folha seguinte
        if (n < Math.min(2, restam) || !fluxo.cabe(alt(n))) { fluxo.novaFolha(); continue; }
        const usa = n < restam ? n - 1 : n; // a última linha da caixa vira o aviso
        caixa(i ? `${rotulo.replace(/:\s*$/, "")} (continuação):` : rotulo, [...linhas.slice(i, i + usa), ...(usa < restam ? [AVISO] : [])]);
        i += usa;
      }
    },

    /** Os instrumentos, partidos entre folhas quando não cabem todos (cada pedaço com o próprio rótulo). */
    instrumentos(lista) {
      const todos = Array.isArray(lista) ? lista : [];
      let i = 0;
      while (i < todos.length) {
        const restam = todos.length - i;
        let n = restam;
        while (n > 0 && !fluxo.cabe(alturaInstrumentos(n))) n--;
        if (n < Math.min(2, restam)) { fluxo.novaFolha(); continue; }
        f.blocoInstrumentos(todos.slice(i, i + n));
        i += n;
      }
    },

    /**
     * Fecha o documento: assinaturas logo abaixo do conteúdo e cabeçalho no topo de cada folha deste fluxo.
     * ⚠ As assinaturas seguem o conteúdo, como no modelo — o espaço delas foi reservado no pé, então o
     * cursor de cada folha nunca passa de `piso` e o bloco sempre cabe.
     * ⚠ Chamar DEPOIS das folhas de foto, com o total de folhas do documento inteiro.
     */
    async fechar(total) {
      for (const [i, { f: fo, topo }] of folhas.entries()) {
        await fo.blocoAssinaturas(assinaturas, papeis, { inspetor });
        fo.y = topo;
        fo.cabecalho({ ...cabecalho, folha: i + 1, total });
      }
    },
  };
  return fluxo;
}
