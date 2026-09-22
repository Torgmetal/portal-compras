import { marcaDoNome } from "./marca";
import { numeroLibellula as numero } from "./numero";

// ─── LIBELLULA (Laser Chapa) ─────────────────────────────────────────────────
//
// | Arquivo | O que é |
// |---|---|
// | `.lxd` | o que vai para a máquina — **XML aberto, só geometria** |
// | `.pdf` | "Informações sobre agrupamento": o relatório do operador |
//
// ⚠⚠ O `.lxd` NÃO TEM O NOME DE NENHUMA PEÇA, e isso decidiu a engine inteira. O censo de tags do
// arquivo real (13/09/2026) devolveu: `LwPolyline` 744 · `Point` 6.202 · `LeadIn` 185 · `Circle`
// 21 — e **nenhuma tag de texto**. As marcas gravadas na chapa foram **vetorizadas**: viraram
// desenho no canal 2 (579 polilinhas), não texto. Por isso o **PDF é o leitor primário** no Laser
// Chapa, que é justamente a máquina que mais produz.
//
// ⚠ O `.lxd` ainda serve — e bem — para CONFERIR que o arquivo é daquele plano: ver `lerLxd`.

/**
 * O relatório em PDF (já convertido em texto).
 *
 * ⚠ O código vem com a pasta do projeto na frente (`T107-TMSA\\T107A-P14`); `marcaDoNome` tira.
 */
export function lerRelatorioLibellula(texto) {
  const t = String(texto ?? "").replace(/\s+/g, " ");
  const pega = (re, i = 1) => t.match(re)?.[i];
  const itens = lerItens(t);
  return {
    trabalho: pega(/Trabalho\s+(.+?)\s+Fibra Laser/)?.trim() || null,
    material: pega(/Chapas n\s*°\s*\d+\s+(\S+)/) || null,
    espessuraMm: numero(pega(/Chapas n\s*°\s*\d+\s+\S+\s+([\d.,]+)/)),
    chapas: Number(pega(/Chapas n\s*°\s*(\d+)/)) || null,
    chapaMm: t.match(/([\d.,]+)\s*x\s*([\d.,]+)\s+[\d.,]+\s*x\s*[\d.,]+/)?.slice(1, 3).map(numero) || null,
    pecas: Number(pega(/Qty peça\s+(\d+)/)) || null,
    piercings: Number(pega(/([\d.]+)\s+(\d+)\s*Não utilizado/, 2)) || null,
    itens,
    // ⚠⚠ LINHA PERDIDA TEM DE APARECER (achado do Codex, 13/09/2026). A tabela é lida por regex; um
    // código sem contrabarra, um "×" no lugar do "x", uma coluna a mais — e a linha simplesmente
    // não casa. Sem esta conta, o plano seria importado com uma marca a menos e ninguém saberia.
    falhas: falhasDaLeitura(itens, Number(pega(/Qty peça\s+(\d+)/)) || null),
  };
}

function falhasDaLeitura(itens, pecas) {
  const falhas = [];
  if (!itens.length) return ["Nenhuma peça lida na tabela — este PDF é da Libellula?"];
  const soma = itens.reduce((a, i) => a + i.qtd, 0);
  if (pecas && soma !== pecas) {
    falhas.push(`O cabeçalho diz ${pecas} peças e a tabela soma ${soma} — alguma linha não foi lida.`);
  }
  return falhas;
}

/**
 * A tabela da página 2: `ID · Código de peça · Dimensão · Perímetro · Peso · Qty · Piercing …`
 *
 * ⚠ A descrição pode vir VAZIA (é o caso destes arquivos), então a âncora é o código com a
 * contrabarra, não a posição da coluna.
 */
function lerItens(t) {
  // ⚠ A coluna "Descrição" fica ENTRE o código e a dimensão e vem vazia nestes arquivos — mas pode
  // vir preenchida em outra obra (achado do Codex). Por isso o `.*?` no meio: o que ancora é o
  // código e o par de dimensões, não a posição da coluna.
  const re = /(\d+)\s+(\S*\\\S+)\s+(.*?)([\d.,]+)\s*x\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(\d+)\s+(\d+)/g;
  return [...t.matchAll(re)].map((m) => ({
    id: Number(m[1]),
    ...marcaDoNome(m[2]),
    nomeNoArquivo: m[2],
    projeto: m[2].split("\\")[0],
    descricao: m[3].trim() || null,
    dimensaoMm: [numero(m[4]), numero(m[5])],
    perimetroMm: numero(m[6]),
    pesoKg: numero(m[7]),
    qtd: Number(m[8]),
    piercings: Number(m[9]),
  }));
}

/**
 * O `.lxd`, para CONFERÊNCIA — não para nomear peça.
 *
 * ⚠⚠ A CONTA QUE FECHA: os contornos de CORTE (canal 1) mais os furos redondos dão **exatamente** o
 * `Piercing N.` do relatório — 164 + 21 = 185, batido no arquivo real. É o que prova que este
 * `.lxd` é deste PDF, sem depender do nome do arquivo, que qualquer um renomeia.
 */
export function lerLxd(xml) {
  const t = String(xml ?? "");
  const porCanal = (n) => (t.match(new RegExp(`<LwPolyline[^>]*ChannelPort="${n}"`, "g")) || []).length;
  const contornos = porCanal(1);
  const furos = (t.match(/<Circle/g) || []).length;
  const piercings = (t.match(/<LeadIn/g) || []).length;
  return {
    corte: contornos,
    gravacao: porCanal(2),          // a marca da peça, vetorizada
    furos,
    piercings,
    chapaMm: chapaDoDesenho(t),
    // ⚠ Arquivo vazio dava `0 + 0 === 0` e se declarava coerente (achado do Codex). Coerência de
    // nada não é coerência.
    fecha: piercings > 0 && contornos + furos === piercings,
  };
}

/**
 * ⚠⚠ A CHAPA NÃO ESTÁ NO `<ExtMax>` DO CABEÇALHO — ele vem `-50..50` nestes arquivos, que é o
 * padrão do documento vazio, não a chapa (medido em 13/09/2026: a minha primeira versão acusava
 * "a chapa do relatório é 1500x3000 e a do .lxd é 50x50" num arquivo perfeito). A chapa é a
 * polilinha de CONTORNO, marcada `NoExport="1"` — o retângulo que o desenho não corta.
 */
function chapaDoDesenho(t) {
  const contorno = t.match(/<LwPolyline[^>]*NoExport="1"[^>]*>([\s\S]*?)<\/LwPolyline>/);
  if (!contorno) return [null, null];
  const pontos = [...contorno[1].matchAll(/<Point(?:\s+X="([\d.-]+)")?(?:\s+Y="([\d.-]+)")?\s*\/>/g)];
  const eixo = (i) => Math.max(...pontos.map((p) => numero(p[i]) || 0));
  return [eixo(1), eixo(2)];
}

/**
 * O `.lxd` bate com ESTE relatório?
 *
 * ⚠⚠ ISTO É CONFERÊNCIA, NÃO PROVA DE IDENTIDADE — e a diferença importa. Dois planos diferentes
 * da mesma obra podem ter o mesmo número de piercings e a mesma chapa; a conta bater não garante
 * que o arquivo é daquele PDF. Serve para PEGAR o par errado, não para carimbar o par certo. Quem
 * garante versão é o hash dos dois arquivos gravado junto na importação.
 */
export function confereComRelatorio(lxd, relatorio) {
  if (!lxd?.piercings) return ["O .lxd não tem geometria de corte — está vazio?"];
  const avisos = [];
  if (relatorio?.piercings && lxd.piercings !== relatorio.piercings) {
    avisos.push(`O relatório diz ${relatorio.piercings} piercings e o .lxd tem ${lxd.piercings}.`);
  }
  return [...avisos, ...chapaDiferente(lxd.chapaMm, relatorio?.chapaMm)];
}

/** ⚠ 1 mm de folga: o `.lxd` guarda a chapa em coordenadas e o relatório, arredondada. */
function chapaDiferente([x, y] = [], [rx, ry] = []) {
  if (!rx || !ry || !x || !y) return [];
  const longe = Math.abs(x - rx) > 1 || Math.abs(y - ry) > 1;
  return longe ? [`A chapa do relatório é ${rx}x${ry} e a do .lxd é ${x}x${y}.`] : [];
}
