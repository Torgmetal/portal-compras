// ENSAIO POR ULTRASSOM — o que a tela pede e o que o portal calcula.
//
// Tudo aqui sai do PI-QUA-003 Rev.1 (set/2020) — "Ensaios de Ultrassom conforme AWS D1.1", da
// QUALINSP. Vitor apontou o procedimento; as listas e as fórmulas são dele, não escolha minha.
//
// ⚠ SÓ A DESCONTINUIDADE REPROVADA É REGISTRADA (item 15.1). A tabela do relatório não é "todas as
// indicações": é o que rejeitou. A exceção é solda designada em contrato como crítica à fratura,
// onde também entram indicações até 6 dB abaixo do nível de rejeição. Isso muda o sentido da folha
// — e é o tipo de coisa que, mal entendida, faz o inspetor lançar dezenas de linhas à toa.

/** Aparelhos aprovados no item 4 do procedimento. Todos pulso-eco. */
export const APARELHOS = [
  "Mitech MDF350B",
  "Krautkramer USN-52",
  "Krautkramer USN-50",
  "Krautkramer USM-25",
  "Krautkramer USM-35",
  "Modsonic-Einstein TFT",
  "GE USM GO",
  "Sonatest Sitescan 150",
];

/**
 * Cabeçotes do item 6.1 — a MARCA em campo próprio, separada do modelo.
 *
 * ⚠ Vitor (22/09/2026), no seletor do relatório de US: "precisamos tirar esse Mitech, pois já
 * informamos a marca dele antes — deixar apenas angular 20x22 70 · 2"; e "o ângulo não precisa
 * [do símbolo de] grau". O rótulo da tela é `rotuloCabecote`; a marca continua no dado e sai no
 * documento (campo CABEÇOTE — FABRICANTE), porque o relatório tem de dizer de quem é o cabeçote.
 *
 * ⚠⚠ MITECH E DOPPLER TÊM O MESMO "angular 20x22" NOS TRÊS ÂNGULOS. Sem a marca, as opções ficam
 * idênticas — por isso a lista aparece AGRUPADA POR FABRICANTE (optgroup) e o formulário grava
 * `cbFabricante` junto de `cbModelo`. Tirar a marca do rótulo sem isso seria trocar um texto
 * comprido por duas linhas que o inspetor não consegue distinguir.
 */
export const CABECOTES = [
  { fabricante: "Mitech", modelo: "angular 20x22", angulo: 45, mhz: 2 },
  { fabricante: "Mitech", modelo: "angular 20x22", angulo: 60, mhz: 2 },
  { fabricante: "Mitech", modelo: "angular 20x22", angulo: 70, mhz: 2 },
  { fabricante: "Mitech", modelo: "normal Ø24", angulo: null, mhz: 2 },
  { fabricante: "Doppler", modelo: "angular 20x22", angulo: 45, mhz: 2 },
  { fabricante: "Doppler", modelo: "angular 20x22", angulo: 60, mhz: 2 },
  { fabricante: "Doppler", modelo: "angular 20x22", angulo: 70, mhz: 2 },
  { fabricante: "Krautkramer", modelo: "WB45N2", angulo: 45, mhz: 2 },
  { fabricante: "Krautkramer", modelo: "WB60N2", angulo: 60, mhz: 2 },
  { fabricante: "Krautkramer", modelo: "WB70N2", angulo: 70, mhz: 2 },
  { fabricante: "Krautkramer", modelo: "MWB45N4", angulo: 45, mhz: 4 },
  { fabricante: "Krautkramer", modelo: "MWB60N4", angulo: 60, mhz: 4 },
  { fabricante: "Krautkramer", modelo: "MWB70N4", angulo: 70, mhz: 4 },
  { fabricante: "Krautkramer", modelo: "MWK45N4", angulo: 45, mhz: 4 },
  { fabricante: "Krautkramer", modelo: "MWK60N4", angulo: 60, mhz: 4 },
  { fabricante: "Krautkramer", modelo: "MWK70N4", angulo: 70, mhz: 4 },
];

/** O que o inspetor lê e o que fica gravado em `cbModelo`: "angular 20x22 · 70 · 2 MHz". */
export const rotuloCabecote = (c) => [c.modelo, c.angulo ? String(c.angulo) : null, `${c.mhz} MHz`].filter(Boolean).join(" · ");

/**
 * A identidade de um cabeçote no seletor: `fabricante|rótulo`.
 *
 * ⚠⚠ O RÓTULO SOZINHO NÃO IDENTIFICA, E ISSO GRAVAVA MARCA ERRADA (achado do Codex, 22/09/2026).
 * Mitech e Doppler têm "angular 20x22" nos mesmos três ângulos; tirado o nome da marca do rótulo,
 * as duas telas descobriam o fabricante procurando pelo texto da opção — e o `find` acha Mitech
 * primeiro. Escolher o Doppler gravava Mitech, no documento que vai ao cliente.
 *
 * ⚠ O que fica gravado continua sendo o RÓTULO em `cbModelo` (é o que o PDF imprime) e a marca em
 * `cbFabricante`. A chave existe só para o <select> ter valores distintos.
 */
export const chaveCabecote = (fabricante, rotulo) => `${fabricante || ""}|${rotulo || ""}`;

/** O caminho de volta: da chave do seletor para a marca e o rótulo. */
export function cabecoteDaChave(chave) {
  const texto = String(chave || "");
  const corte = texto.indexOf("|");
  if (corte < 0) return { fabricante: "", rotulo: texto };
  return { fabricante: texto.slice(0, corte), rotulo: texto.slice(corte + 1) };
}

/** Os cabeçotes agrupados por fabricante, na ordem da lista — para o `optgroup` do seletor. */
export function cabecotesPorFabricante() {
  const grupos = new Map();
  for (const c of CABECOTES) {
    if (!grupos.has(c.fabricante)) grupos.set(c.fabricante, []);
    const rotulo = rotuloCabecote(c);
    grupos.get(c.fabricante).push({ ...c, rotulo, valor: chaveCabecote(c.fabricante, rotulo) });
  }
  return [...grupos.entries()].map(([fabricante, itens]) => ({ fabricante, itens }));
}

/**
 * O metal base que a Torg ensaia. Vitor (22/09/2026): "deixe ela pré-setado em aço carbono".
 * ⚠ É PADRÃO, NÃO TRAVA: o campo continua digitável — obra com aço patinável ou inox se corrige
 * ali mesmo. Nasce preenchido porque, em toda a fabricação da casa, é essa a resposta.
 */
export const MATERIAL_PADRAO = "Aço carbono";

/**
 * A JUNTA QUE SE ENSAIA POR ULTRASSOM, na Torg.
 *
 * Vitor (22/09/2026): "para o processo de soldagem, deixar o seletor GMAW ou FCAW; o tipo de junta
 * deixar sempre Topo; para o tipo de chanfro deixar seletor para X ou V; na técnica de ensaio pode
 * deixar sempre fixo Direto".
 *
 * ⚠ PROCESSO E CHANFRO SÃO ESCOLHA, NÃO PADRÃO: o processo é GMAW ou FCAW conforme a solda, e o
 * chanfro é X ou V conforme a junta real. Marcar um dos dois de antemão seria preencher laudo no
 * lugar de quem inspeciona — o mesmo motivo de o ângulo real não vir preenchido.
 */
export const PROCESSOS_SOLDA = ["GMAW", "FCAW"];
export const CHANFROS = ["X", "V"];
export const JUNTA_PADRAO = "Topo";
export const TECNICA_PADRAO = "Direto";

/**
 * A APARELHAGEM DA CASA — com o que a Torg ensaia, sempre.
 *
 * Vitor (22/09/2026): "o 2 MHz é fixo, isso não muda; o modelo do aparelho e do cabeçote é sempre o
 * mesmo, pode deixar fixo". O relatório nasce com estes valores preenchidos (e o inspetor pode
 * trocar, se um dia houver outro aparelho — o que ele escolher é o que vai no documento).
 *
 * ⚠ Os números de série são do EQUIPAMENTO, não da inspeção: repetir-se é o comportamento certo.
 * ⚠⚠ O ÂNGULO REAL fica de fora de propósito — é medido no bloco padrão a cada ensaio.
 */
export const APARELHAGEM_PADRAO_US = {
  apModelo: "Mitech MDF350B",
  apSerie: "FD10012912",
  cbFabricante: "Mitech",
  cbModelo: "angular 20x22 · 70 · 2 MHz",
  cbSerie: "2206365",
  // ⚠ Vitor (22/09/2026): "o tipo de junta deixar sempre Topo" e "na técnica de ensaio pode deixar
  // sempre fixo Direto". Nascem preenchidos; continuam editáveis, porque um dia pode aparecer uma
  // junta em T e a inspeção tem de poder dizer isso.
  tipoJunta: JUNTA_PADRAO,
  tecnica: TECNICA_PADRAO,
};

/**
 * ESPESSURAS DE CHAPA — o seletor do campo "Espessura" do RUS.
 *
 * Vitor (22/09/2026): "preciso que você coloque o seletor de espessura de chapas de 8 até 3
 * polegadas". A faixa vai de 8,00 mm a 76,20 mm (3").
 *
 * ⚠ A lista é a das chapas que a casa de fato usa — conferida no banco (RMItem e PecaConjunto):
 * 8, 9,50, 12,50, 16, 19, 22,40, 25, 31,50, 38 e 44,50 mm aparecem em pedido e em peça; 50,80,
 * 63,50 e 76,20 completam até as 3". ⚠ A polegada é a BITOLA COMERCIAL, não a conversão exata
 * (5/16" são 7,94 mm e se vende como 8,00) — por isso ela fica só no rótulo, e o que vai para o
 * documento é o milímetro.
 */
export const ESPESSURAS_CHAPA = [
  { mm: 8, pol: "5/16" },
  { mm: 9.5, pol: "3/8" },
  { mm: 12.5, pol: "1/2" },
  { mm: 16, pol: "5/8" },
  { mm: 19, pol: "3/4" },
  { mm: 22.4, pol: "7/8" },
  { mm: 25.4, pol: "1" },
  { mm: 31.5, pol: "1.1/4" },
  { mm: 38, pol: "1.1/2" },
  { mm: 44.5, pol: "1.3/4" },
  { mm: 50.8, pol: "2" },
  { mm: 63.5, pol: "2.1/2" },
  { mm: 76.2, pol: "3" },
];

const mmBR = (n) => n.toFixed(2).replace(".", ",");
/** O que fica gravado e sai no documento: "12,50 mm". */
export const valorEspessura = (e) => `${mmBR(e.mm)} mm`;
/** O que o inspetor lê na lista: "12,50 mm (1/2")". */
export const rotuloEspessura = (e) => `${mmBR(e.mm)} mm${e.pol ? ` (${e.pol}")` : ""}`;

/** Ângulos usados na varredura (tabela 1 do item 15.1). */
export const ANGULOS = [45, 60, 70];

/** Item 12: "será utilizado metilcelulose dissolvido em água". Lista de um — como o metal base. */
export const ACOPLANTES = ["Metilcelulose em água"];

/** Blocos padrão citados na calibração (item 8). */
export const BLOCOS_PADRAO = ["V1 (IIW)", "V2", "DS", "Bloco de referência conforme AWS D1.1"];

export const FACES = ["A", "B", "C", "D"];

/**
 * Tipo de estrutura — aqui é OBRIGATÓRIO, ao contrário do visual de solda.
 *
 * ⚠ O item 18.1 exige "tipo de estrutura (estaticamente ou dinamicamente carregada)" no conteúdo
 * mínimo do relatório, e o critério muda com ele: item 15.6 para estática, 15.7 para dinâmica. É o
 * mesmo campo que o Vitor mandou tirar do EVS — lá não constava no modelo, aqui o procedimento manda.
 */
export const TIPOS_CARREGAMENTO = [
  { id: "ESTATICA", nome: "Estaticamente carregada", item: "15.6" },
  { id: "DINAMICA", nome: "Dinamicamente carregada", item: "15.7" },
];

/**
 * O FATOR DE ATENUAÇÃO "c" (item 15.3).
 *
 * "obtido subtraindo 1 polegada (25,4 mm) do percurso sônico da descontinuidade e multiplicando por
 * 2 o percurso sônico remanescente (em polegadas). Arredondado para o dB mais próximo; menor que
 * 0,5 para baixo, maior ou igual a 0,5 para cima."
 *
 * ⚠ O percurso entra em MILÍMETROS (é como se mede) e a conta é em POLEGADAS — é aí que se erra
 * fazendo à mão.
 */
export function fatorAtenuacao(percursoMm) {
  const p = Number(percursoMm);
  if (!Number.isFinite(p) || p <= 25.4) return 0;
  const restanteEmPolegadas = (p - 25.4) / 25.4;
  return Math.round(restanteEmPolegadas * 2);
}

/**
 * A CLASSIFICAÇÃO DA INDICAÇÃO "d" (item 15.4): d = a − b − c.
 *
 * ⚠ CALCULADA, NÃO DIGITADA. É o número que decide se a descontinuidade é aceitável, comparado com
 * a tabela do critério. Valor que decide aprovação e é digitado à mão é valor que se erra — mesma
 * razão da média de espessura no relatório de pintura.
 */
export function classificacaoIndicacao({ a, b, percursoMm, c = null }) {
  const na = Number(a), nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return { c: null, d: null };
  const fc = c != null && Number.isFinite(Number(c)) ? Number(c) : fatorAtenuacao(percursoMm);
  return { c: fc, d: +(na - nb - fc).toFixed(1) };
}

/**
 * A tabela de aceitação (itens 15.6 e 15.7) ainda NÃO está cadastrada.
 *
 * ⚠ Vitor (21/08/2026): "os que você não tiver as informações deixe em branco na seleção que vou
 * providenciar posteriormente". As tabelas 2 e 3 do PI-QUA-003 estão como IMAGEM no PDF — não há
 * como lê-las. Enquanto não vierem, o portal calcula o "d" e mostra o valor, mas NÃO diz se passa:
 * quem julga é o inspetor com a tabela impressa na mão.
 *
 * Dizer "aprovado" a partir de uma tabela que eu não tenho seria a pior forma de errar aqui.
 */
export const TABELA_ACEITACAO_DISPONIVEL = false;

// ─── O CABEÇALHO DO RUS, CAMPO A CAMPO ─────────────────────────────────────────────────────────
//
// ⚠⚠ TODO CAMPO QUE O PDF IMPRIME TEM ONDE PREENCHER — nas DUAS telas. Vitor (25/09/2026): "nos
// demais campos da planilha do relatório de US precisamos ter como o inspetor preencher essas
// informações, no campo de desenho e metal de adição não está sendo possível preencher (…) tipo de
// chanfro tbm, todos os campos precisamos deixar para ser possível ajustar". O celular não tinha
// desenho, material nem espessura (a rota nem gravava os dois últimos); nenhuma tela deixava
// ajustar TAG, procedimento, norma, critério, as marcas e as medidas do cabeçote.
//
// ⚠ AS LISTAS DA CASA VIRAM SUGESTÃO. Chanfro só "X" ou "V", processo só GMAW/FCAW (22/09) eram a
// regra de quem ensaia aqui — mas o que não estava na lista não tinha como ser escrito. Agora se
// escolhe da lista OU se digita outro valor.
//
// As telas e as duas rotas leem DAQUI; o teste `us-cabecalho-campos` cobra que o PDF imprima cada um.
const unicos = (xs) => [...new Set(xs)];
export const CAMPOS_CABECALHO_US = Object.freeze([
  { k: "desenho", rotulo: "Desenho de referência", grupo: "identificacao" },
  { k: "tag", rotulo: "Equipamento / TAG", grupo: "identificacao" },
  { k: "procedimento", rotulo: "Procedimento / revisão", grupo: "identificacao" },
  { k: "norma", rotulo: "Norma de referência", grupo: "identificacao", sugestoes: ["AWS D1.1"] },
  { k: "criterio", rotulo: "Critério de aceitação", grupo: "identificacao", sugestoes: ["AWS D1.1"] },
  { k: "local", rotulo: "Local do ensaio", grupo: "ensaio" },
  { k: "tecnica", rotulo: "Técnica de ensaio", grupo: "ensaio", sugestoes: [TECNICA_PADRAO] },
  { k: "acoplante", rotulo: "Acoplante", grupo: "ensaio", sugestoes: ACOPLANTES },
  { k: "blocoPadrao", rotulo: "Bloco padrão / nº de série", grupo: "ensaio", sugestoes: BLOCOS_PADRAO },
  { k: "apFabricante", rotulo: "Aparelho — fabricante", grupo: "aparelho" },
  { k: "apModelo", rotulo: "Aparelho — modelo", grupo: "aparelho", sugestoes: APARELHOS },
  { k: "apSerie", rotulo: "Aparelho — nº de série", grupo: "aparelho" },
  { k: "cbFabricante", rotulo: "Cabeçote — fabricante", grupo: "cabecote", sugestoes: unicos(CABECOTES.map((c) => c.fabricante)) },
  { k: "cbModelo", rotulo: "Cabeçote — modelo", grupo: "cabecote", sugestoes: unicos(CABECOTES.map(rotuloCabecote)) },
  { k: "cbAngulo", rotulo: "Cabeçote — ângulo real (graus)", grupo: "cabecote", sugestoes: ANGULOS.map(String) },
  { k: "cbDimensoes", rotulo: "Cabeçote — dimensões", grupo: "cabecote" },
  { k: "cbFrequencia", rotulo: "Cabeçote — frequência", grupo: "cabecote", sugestoes: ["2 MHz", "4 MHz"] },
  { k: "cbSerie", rotulo: "Cabeçote — nº de série", grupo: "cabecote" },
  { k: "material", rotulo: "Material", grupo: "junta", sugestoes: [MATERIAL_PADRAO] },
  { k: "espessura", rotulo: "Espessura", grupo: "junta", sugestoes: ESPESSURAS_CHAPA.map(valorEspessura),
    rotulos: Object.fromEntries(ESPESSURAS_CHAPA.map((e) => [valorEspessura(e), rotuloEspessura(e)])) },
  { k: "metalAdicao", rotulo: "Metal de adição", grupo: "junta" },
  { k: "processoSolda", rotulo: "Processo de soldagem", grupo: "junta", sugestoes: PROCESSOS_SOLDA },
  { k: "tipoJunta", rotulo: "Tipo de junta", grupo: "junta", sugestoes: [JUNTA_PADRAO] },
  { k: "chanfro", rotulo: "Tipo de chanfro", grupo: "junta", sugestoes: CHANFROS },
]);

/** Os títulos dos blocos, na ordem das telas. */
export const GRUPOS_CABECALHO_US = Object.freeze([
  { id: "identificacao", titulo: "Identificação e documentos" },
  { id: "aparelho", titulo: "Aparelho" },
  { id: "cabecote", titulo: "Cabeçote" },
  { id: "ensaio", titulo: "Condições do ensaio" },
  { id: "junta", titulo: "A junta ensaiada" },
]);
