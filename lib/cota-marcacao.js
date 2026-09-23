// COMO A COTA A / B / C É DESENHADA.
//
// Vitor (21/08/2026), com um exemplo desenhado à mão: "esquece conseguir colocar cota, vamos apenas
// trazer o desenho da maneira que você colocou... você não consegue só criar algumas linhas igual a
// imagem da linha A, B e C, apenas para conseguir mostrar onde vamos medir e colocar as medidas de
// referência?".
//
// Ou seja: NÃO é uma cota medida em cima do traço. É uma linha de chamada clássica, FORA da peça,
// com as duas extensões descendo até os pontos marcados e a letra por cima. Ela não diz quanto mede
// — diz ONDE medir. O valor vive na tabela do relatório.
//
// ⚠ Este módulo é compartilhado pela TELA e pelo PDF de propósito. São dois desenhos do mesmo
// objeto, e qualquer diferença entre eles apareceria como "na tela estava em outro lugar".
//
// ⚠ A peça é desenhada com uma FOLGA em volta (PADDING), senão não há onde pôr as linhas: o recorte
// é justo na peça. As duas pontas do que se marcou continuam nas coordenadas da vista; quem soma a
// folga é o desenho, não o dado.

/** Folga em volta da vista, em unidades da própria vista, onde as linhas de cota são desenhadas. */
export const PADDING = 46;

/** Espaço entre uma linha de cota e a seguinte do mesmo lado. */
const DEGRAU = 15;

/**
 * Onde cada cota deve ser desenhada.
 *
 * @param {Array<{letra,ax,ay,bx,by,lado,afastamento}>} cotas `lado` ("topo"/"base" ou "esq"/"dir")
 *   força o lado escolhido à mão; sem ele, o lado sai sozinho da metade da folha onde a cota foi
 *   marcada. `afastamento` (pt, na vista) força a distância da linha até a peça — NEGATIVO põe a
 *   linha por cima do desenho; sem ele, sai do degrau automático (12pt + 15pt por cota que já ocupa
 *   aquele lado).
 * @param {number} largura da vista (sem a folga)
 * @param {number} altura   da vista (sem a folga)
 * @returns {Array} para cada cota: pontas, linha, extensões e posição da letra — já COM a folga
 *                  somada, prontas para desenhar num espaço (largura+2·PADDING) × (altura+2·PADDING)
 */
export function layoutCotas(cotas, largura, altura) {
  const usados = { topo: 0, base: 0, esq: 0, dir: 0 };
  const saida = [];

  for (const c of cotas || []) {
    if (c?.ax == null || c?.bx == null) { saida.push(null); continue; }
    const ax = c.ax + PADDING, ay = c.ay + PADDING;
    const bx = c.bx + PADDING, by = c.by + PADDING;
    // o que se está medindo: a distância horizontal ou a vertical?
    const vertical = Math.abs(by - ay) > Math.abs(bx - ax);

    let lado, nivel, linha, ext1, ext2, rotulo;
    if (!vertical) {
      // ⚠⚠ O LADO ESCOLHIDO À MÃO VALE POR CIMA DA METADE AUTOMÁTICA. Vitor (03/09/2026): "eu
      // preciso conseguir editar para qual lado eu quero que a representação da cota vai ficar,
      // hoje você escolhe por mim... quero poder fazer isso marcando mas podendo ajustar ela" — a
      // metade da folha é só o palpite de partida, não a palavra final: o desenho pode ter outra
      // cota, texto ou traço bem onde o palpite mandaria a linha, e só quem está olhando vê isso.
      lado = c.lado === "topo" || c.lado === "base" ? c.lado
        : (ay + by) / 2 > altura / 2 + PADDING ? "topo" : "base";
      nivel = usados[lado]++;
      // ⚠⚠ AFASTAMENTO ESCOLHIDO À MÃO. Vitor (03/09/2026): "seria bom poder ajustar a altura dela
      // também... deixar mais comprida ou mais curta" — a distância padrão (12 + um degrau por
      // cota que já ocupa o lado) é só o ponto de partida; `afastamento`, quando presente, substitui
      // a conta inteira para ESTA cota.
      //
      // ⚠⚠ E PODE SER NEGATIVO, que é a cota EM CIMA do desenho. Vitor (03/09/2026): "você não deixa
      // eu colocar ela em cima do desenho, ou seja não consigo colocar ela onde eu preciso" — o piso
      // era 6, o que prendia a linha na folga em volta da peça. Num diagrama de montagem a medida a
      // conferir mora no meio do desenho (vão entre dois pilares, por exemplo) e a linha de chamada
      // precisa cair ali. O teto continua em PADDING - 6 (além disso sairia da folga e seria cortada
      // no papel); o piso vai até a borda oposta, para a linha atravessar a peça sem sumir da folha.
      const base = c.afastamento != null
        ? Math.max(-(altura + PADDING - 6), Math.min(c.afastamento, PADDING - 6))
        : 12 + nivel * DEGRAU;
      const y = lado === "topo" ? altura + PADDING + base : PADDING - base;
      linha = { a: [ax, y], b: [bx, y] };
      ext1 = { a: [ax, ay], b: [ax, y + (lado === "topo" ? 4 : -4)] };
      ext2 = { a: [bx, by], b: [bx, y + (lado === "topo" ? 4 : -4)] };
      rotulo = { x: (ax + bx) / 2, y: y + 5, vertical: false };
    } else {
      lado = c.lado === "esq" || c.lado === "dir" ? c.lado
        : (ax + bx) / 2 > largura / 2 + PADDING ? "dir" : "esq";
      nivel = usados[lado]++;
      // idem: negativo = cota por cima do desenho (ver a nota do caso horizontal)
      const base = c.afastamento != null
        ? Math.max(-(largura + PADDING - 6), Math.min(c.afastamento, PADDING - 6))
        : 12 + nivel * DEGRAU;
      const x = lado === "dir" ? largura + PADDING + base : PADDING - base;
      linha = { a: [x, ay], b: [x, by] };
      ext1 = { a: [ax, ay], b: [x + (lado === "dir" ? 4 : -4), ay] };
      ext2 = { a: [bx, by], b: [x + (lado === "dir" ? 4 : -4), by] };
      rotulo = { x: x - 5, y: (ay + by) / 2, vertical: true };
    }

    saida.push({ letra: c.letra, vertical, lado, linha, ext1, ext2, rotulo, pontas: [[ax, ay], [bx, by]] });
  }
  return saida;
}

/**
 * As duas hastes da seta (ou do tique) numa ponta da linha de cota.
 * Devolve pares de pontos prontos para virar dois traços.
 */
export function setaEm(p, direcao, tam = 5) {
  const [dx, dy] = direcao;
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  const px = -uy, py = ux; // perpendicular
  return [
    [p, [p[0] + ux * tam + px * tam * 0.35, p[1] + uy * tam + py * tam * 0.35]],
    [p, [p[0] + ux * tam - px * tam * 0.35, p[1] + uy * tam - py * tam * 0.35]],
  ];
}

// ─── O NOME DA COTA ───────────────────────────────────────────────────────────
// Vitor (18/09/2026): "estamos tentando colocar as descrições das cotas no relatório de pré
// montagem da OP-105, e não estamos conseguindo". Não dava mesmo: a descrição nascia como
// "Cota A", era mostrada como texto fixo e ainda era REESCRITA a cada renumeração. Agora ela é
// digitável, e estas funções guardam a única regra que isso exige.
//
// ⚠ A LETRA continua sozinha no desenho. Vitor (21/08/2026): "nas marcações laterais você precisa
// trazer apenas isso: cota A, Cota B e Cota C" — quem diz ONDE medir é a marca no desenho. A
// descrição é o que sai na COLUNA da tabela do relatório ([[torg_cotas_abc]]).
export const LETRAS_COTA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Letra da cota na posição `i` (A, B, … Z, depois C27, C28…). */
export const letraDaCota = (i) => LETRAS_COTA[i] || `C${i + 1}`;

/** O rótulo automático de uma cota — o que ela recebe quando ninguém escreveu nada. */
export const descricaoPadraoCota = (letra) => `Cota ${letra}`;

/**
 * A descrição foi escrita por alguém, ou é só o rótulo automático?
 * ⚠ Vazio conta como padrão: renumerar tem de devolver o rótulo, não deixar a célula em branco.
 */
export function ehDescricaoPadraoCota(descricao) {
  const d = String(descricao ?? "").trim();
  if (!d) return true;
  return /^cota\s+([a-z]|c\d+)$/i.test(d);
}

/**
 * Renumera as cotas depois de remover uma, PRESERVANDO a descrição digitada.
 * ⚠⚠ Antes isto sobrescrevia tudo com `Cota <letra>`: quem tivesse escrito "Vão entre apoios"
 * perdia o texto ao apagar qualquer outra cota. Só o rótulo automático acompanha a letra nova.
 */
export function renumerarCotas(cotas) {
  return (cotas || []).map((c, i) => {
    const letra = letraDaCota(i);
    const descricao = ehDescricaoPadraoCota(c?.descricao) ? descricaoPadraoCota(letra) : c.descricao;
    return { ...c, letra, descricao };
  });
}

// ─── DE QUAL DESENHO É A COTA ─────────────────────────────────────────────────
// Vitor (23/09/2026), nos RID-084 da OP-84: "parece que os desenhos estão ficando zuado". O relatório
// de peças avulsas agrupadas tem UM DESENHO POR MARCA, e a cota não guardava em qual deles tinha sido
// marcada: nascia sem `marca`, a tela mostrava TODAS as cotas sobre qualquer desenho escolhido no
// seletor, e o PDF — que agrupa pela marca — mandava a órfã para o ÚLTIMO desenho. As cotas A (703) e
// B (410) do RID-084-002, marcadas no chumbador T84A1, saíam na folha da coluna T84A5, com as
// coordenadas da vista do chumbador: as linhas de chamada escapavam do quadro e da folha.
//
// ⚠ UMA regra, usada pela tela de marcação, pela tela de campo e pelo PDF. Cada um decidindo à sua
// maneira foi o que deixou os três discordarem sobre onde a mesma cota mora.

/**
 * A marca do desenho a que a linha pertence.
 *
 * ⚠⚠ SEM MARCA QUE CASE COM UM DESENHO, É DO PRIMEIRO. É ele que a tela de marcação abre por padrão e
 * o único que a tela de campo mostra — a cota gravada antes desta regra foi marcada ali. Ir para o
 * último, como era, punha a cota sobre uma peça que não é a dela.
 *
 * @param {{marca?:string, conjunto?:string}} linha `conjunto` aponta o pai numa linha de conjunto
 * @param {Array<{marca:string}>} desenhos os desenhos do relatório, na ordem gravada
 * @returns {string|null} `null` quando o relatório não tem desenho
 */
export function desenhoDaLinha(linha, desenhos) {
  const lista = Array.isArray(desenhos) ? desenhos : [];
  const propria = linha?.conjunto || linha?.marca;
  if (propria && lista.some((d) => d?.marca === propria)) return propria;
  return lista[0]?.marca ?? null;
}

/** As linhas de cada desenho, na ordem dos desenhos. Sem desenho nenhum, um grupo só com tudo. */
export function agruparPorDesenho(linhas, desenhos) {
  const ls = Array.isArray(linhas) ? linhas : [];
  const lista = Array.isArray(desenhos) ? desenhos : [];
  if (!lista.length) return [{ desenho: null, linhas: ls }];
  return lista.map((d) => ({
    desenho: d,
    linhas: ls.filter((l) => desenhoDaLinha(l, lista) === d.marca),
  }));
}

/**
 * Troca as cotas do desenho em vista pelas `novas`, sem tocar nas dos outros desenhos.
 *
 * ⚠ Carimba a marca do desenho em toda cota que passa por aqui — inclusive na antiga, sem marca, que
 * só pertencia ao primeiro desenho por dedução: mexida na tela, ela passa a dizer onde mora, e deixa
 * de depender de quem é o primeiro (na pré-montagem o desenho em vista pode ser removido).
 * ⚠ As cotas saem na ordem dos desenhos, para a tabela não se embaralhar conforme o desenho que se
 * editou por último. As linhas que não são cota ficam no fim, como antes.
 *
 * @param {Array} linhas as linhas atuais do relatório
 * @param {Array} novas as cotas do desenho em vista, como a tela de marcação as devolve
 * @param {string} marca a marca do desenho em vista
 * @param {Array<{marca:string}>} desenhos
 */
export function trocarCotasDoDesenho(linhas, novas, marca, desenhos) {
  const ls = Array.isArray(linhas) ? linhas : [];
  const lista = Array.isArray(desenhos) ? desenhos : [];
  const alvo = marca || lista[0]?.marca || null;
  const carimbadas = (novas || []).map((c) => (alvo ? { ...c, marca: alvo } : c));
  const outras = ls.filter((l) => l?.letra && desenhoDaLinha(l, lista) !== alvo);
  const posicao = (l) => {
    const i = lista.findIndex((d) => d.marca === desenhoDaLinha(l, lista));
    return i < 0 ? lista.length : i;
  };
  // `sort` é estável: dentro do mesmo desenho a ordem da tela é mantida
  const cotas = [...carimbadas, ...outras].sort((a, b) => posicao(a) - posicao(b));
  return [...cotas, ...ls.filter((l) => !l?.letra)];
}
