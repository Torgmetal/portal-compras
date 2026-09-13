import { marcaDoNome } from "./marca";
import { numeroTubesT as numero } from "./numero";

// ─── TUBEST / CypTube (Laser Perfil · Laser Cantoneira · Laser Tubo) ──────────
//
// Software: **TubesT 2025V2.12** (`SaveApp=Tubest`, motor CypTube da Friendess), visto em
// `info.xml` dentro do próprio arquivo. Três extensões, o MESMO formato: ZIP com XMLs dentro.
//
// | Arquivo | O que é |
// |---|---|
// | `.yxy` | **o plano inteiro** — todas as barras e todos os tipos de peça |
// | `.zx` / `.zh` | **uma barra** cada (`_Nest 1_X1.zx`), o que vai para a máquina |
// | `.pdf` | o relatório que o operador recebe |
//
// ⚠⚠ "NESTING" AQUI É UMA BARRA, NÃO UMA CHAPA. O programador: *"cada Nest 1, 2, 3, 4… são cada
// BARRA que ele precisa cortar"*. O apontamento do operador é por barra.

const limparRelatorio = (texto) =>
  String(texto ?? "")
    // ⚠ O rodapé de página ("2026/09/11 16:21:12 1/2") cai NO MEIO de um bloco quando a lista de
    // uma barra atravessa a página — foi o que aconteceu com a Nest 3. Sem tirar, o cabeçalho
    // repetido vira linha de peça e a barra ganha um item que não existe.
    .replace(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d+\/\d+/g, " ")
    .replace(/ID\s+Part Name\s+Qty\s+Identical parts per tube\s+Part Length\(mm\)/g, " ¶ITENS¶ ")
    .replace(/\s+/g, " ");


/**
 * O relatório em PDF (já convertido em texto) — **a fonte da quantidade**.
 *
 * ⚠⚠ POR QUE O PDF MANDA NA QUANTIDADE, tendo o arquivo da máquina: porque o arquivo da máquina
 * **não nomeia a peça curta**. A `T107A-P3` tem 62,30 mm — não cabe gravação, então ela sai sem
 * texto no arquivo e só o PDF diz quantas são. Ver `conciliarBarra`.
 */
export function lerRelatorioTubesT(texto) {
  const t = limparRelatorio(texto);
  const secao = t.match(/Part Info Section:(.+?)\s+Part Type:/)?.[1]?.trim() || null;
  const tipos = lerTipos(t);
  const barras = lerBarras(t);
  const barraTotal = Number(t.match(/Tube Count:(\d+)/)?.[1]) || null;
  return {
    secao, tipos, barras, barraTotal,
    tipoTotal: Number(t.match(/Part Type:(\d+)/)?.[1]) || null,
    // ⚠⚠ LEITURA QUE FALHA TEM DE PARECER FALHA, NÃO PLANO VAZIO (achado do Codex, 13/09/2026).
    // Basta o cabeçalho do relatório mudar de `Tube Length(mm)` para `Tube Length (mm)` numa
    // atualização do TubesT para os blocos sumirem — e um plano sem barra nenhuma, sem ninguém
    // dizer nada, seria importado como "plano sem trabalho" em vez de recusado.
    falhas: falhasDaLeitura(t, tipos, barras, barraTotal),
  };
}

function falhasDaLeitura(t, tipos, barras, barraTotal) {
  const falhas = [];
  if (!t.includes("Part Info")) falhas.push("Não achei o bloco `Part Info` — este PDF é do TubesT?");
  if (!tipos.length) falhas.push("Nenhuma marca lida na lista mestra.");
  if (!barras.length) falhas.push("Nenhuma barra lida na `Nesting List`.");
  if (barraTotal && barras.length !== barraTotal) {
    falhas.push(`O relatório diz ${barraTotal} barras e eu li ${barras.length}.`);
  }
  return falhas;
}

/** O bloco `Part Info`: a lista mestra do plano, com o total de cada marca. */
function lerTipos(t) {
  const bloco = t.split("Part Info")[1]?.split("Tube Info")[0] || "";
  const linhas = [...bloco.matchAll(/(\d+)\s+(\S+)\s+(\d+)\/(\d+)\s+([\d.,]+)/g)];
  return linhas.map((m) => ({
    id: Number(m[1]),
    ...marcaDoNome(m[2]),
    nomeNoArquivo: m[2],
    feitas: Number(m[3]),
    total: Number(m[4]),
    comprimentoMm: numero(m[5]),
  }));
}

/** O bloco `Nesting List`: uma barra por vez, com o que sai de cada uma. */
function lerBarras(t) {
  const lista = t.split("Nesting List")[1] || "";
  const pedacos = lista.split(/Nesting Name Qty Parts per tube Tube Length\(mm\) Remnant Length\(mm\) Utilization/).slice(1);
  return pedacos.map(barraDoPedaco).filter(Boolean);
}

function barraDoPedaco(pedaco) {
  const cabeca = pedaco.match(/^\s*(.+?_Nest\s+(\d+))\s+(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)%/);
  if (!cabeca) return null;
  const corpo = pedaco.split("¶ITENS¶").slice(1).join(" ");
  const itens = [...corpo.matchAll(/(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+([\d.,]+)/g)].map((m) => ({
    id: Number(m[1]),
    ...marcaDoNome(m[2]),
    nomeNoArquivo: m[2],
    qtd: Number(m[3]),
    comprimentoMm: numero(m[5]),
  }));
  return {
    nome: cabeca[1].trim(),
    indice: Number(cabeca[2]),
    pecas: Number(cabeca[4]),
    comprimentoMm: numero(cabeca[5]),
    sobraMm: numero(cabeca[6]),
    aproveitamento: numero(cabeca[7]),
    itens,
  };
}

/**
 * O arquivo de UMA barra (`.zx`/`.zh`) ou o plano inteiro (`.yxy`).
 *
 * ⚠⚠ A MARCA ESTÁ GRAVADA NA PEÇA, COMO TEXTO — achado de 13/09/2026, relendo o `.rar` inteiro.
 * `Shapes/content.xml` tem `<TextData Text="T107A-P12_2"/>`, e `Segments/content.xml` diz qual
 * `TubeSegment` carrega qual `<Text>`. Com isso o arquivo da máquina entrega **a ordem de corte
 * peça a peça**, que o PDF não tem — é o que permite ao totem dizer "está cortando a 3ª de 7".
 *
 * ⚠ O `WorkSeq` do `NestedTube` é a ORDEM; os `NestPart` são os TIPOS. Os handles de segmento das
 * duas listas NÃO se cruzam (a barra guarda cópias, com handles novos), então o vínculo peça→marca
 * é o texto gravado, não o handle.
 *
 * @param {(nome:string)=>string} lerEntrada devolve o XML de uma entrada do ZIP
 */
export function lerArquivoTubesT(lerEntrada) {
  const portions = lerEntrada("Portions/content.xml");
  const segments = lerEntrada("Segments/content.xml");
  const shapes = lerEntrada("Shapes/content.xml");
  const info = lerEntrada("info.xml");

  const gravado = textoPorHandle(shapes);
  const doSegmento = textoPorSegmento(segments, gravado);
  return {
    programa: info?.match(/AppName="([^"]+)"\s+AppVer="([^"]+)"/)?.slice(1, 3).join(" ") || null,
    computador: info?.match(/Computer="([^"]+)"/)?.[1] || null,
    tipos: [...portions.matchAll(/<NestPart[^>]*Name="([^"]*)"/g)].map((m) => ({
      ...marcaDoNome(m[1]), nomeNoArquivo: m[1],
    })),
    barras: [...portions.matchAll(/<NestedTube([^>]*)>([\s\S]*?)<\/NestedTube>/g)].map((m) => {
      const nome = m[1].match(/Name="([^"]*)"/)?.[1] || "";
      const ordem = [...m[2].matchAll(/<Seg Handle="(\d+)"/g)].map((s) => s[1]);
      return {
        nome,
        indice: Number(nome.match(/_Nest\s+(\d+)/)?.[1]) || null,
        cortes: ordem.map((h) => ({ segmento: h, gravado: doSegmento.get(h) || null })),
      };
    }),
  };
}

/** handle do `<Text>` → o que está escrito nele. */
function textoPorHandle(shapes) {
  const mapa = new Map();
  const re = /<Text Class="Text" Handle="(\d+)"[\s\S]*?<TextData[^>]*Text="([^"]*)"/g;
  for (const m of String(shapes ?? "").matchAll(re)) mapa.set(m[1], m[2]);
  return mapa;
}

/** handle do `<TubeSegment>` → a marca gravada nele (a peça física). */
function textoPorSegmento(segments, gravado) {
  const mapa = new Map();
  const re = /<TubeSegment([^>]*)>([\s\S]*?)<\/TubeSegment>/g;
  for (const m of String(segments ?? "").matchAll(re)) {
    const handle = m[1].match(/Handle="(\d+)"/)?.[1];
    if (!handle) continue;
    const textos = [...m[2].matchAll(/<Text Handle="(\d+)"/g)]
      .map((t) => gravado.get(t[1])).filter(Boolean);
    if (textos.length) mapa.set(handle, textos[0]);
  }
  return mapa;
}
