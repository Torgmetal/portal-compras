// CRITÉRIO DE ACEITAÇÃO — AWS D1.1, tabela 11 do PO-06 (Ensaio Visual e Dimensional de Soldas, R1).
//
// Transcrito da tabela que o Vitor mandou em 21/08/2026. Estava como IMAGEM dentro do procedimento,
// então não havia como o portal lê-la — por isso a tela pedia o critério como texto livre.
//
// ⚠ O CRITÉRIO MUDA COM O TIPO DE ESTRUTURA. A mesma mordedura que passa numa estrutura
// estaticamente carregada reprova numa ciclicamente carregada: 1 mm contra 0,25 mm em membro
// primário com solda transversal à tração. Sem escolher o tipo, mostrar "o limite" seria inventar
// um número — por isso o tipo é campo obrigatório do relatório, e não um detalhe.
//
// ⚠ TRANSCRIÇÃO FIEL, inclusive das unidades em polegada que a norma traz. Não converti nem
// arredondei: o inspetor compara com o que está no procedimento aprovado, e um valor "ajustado" por
// mim seria divergência entre dois documentos do mesmo SGQ.

export const TIPOS_ESTRUTURA = [
  { id: "ESTATICA", nome: "Estaticamente carregada" },
  { id: "CICLICA", nome: "Ciclicamente carregada" },
  { id: "TUBULAR", nome: "Conexões tubulares" },
];

/** `aplica` diz em quais tipos aquele item vale — é a coluna "X" da tabela. */
export const TABELA_11 = [
  {
    n: 1, titulo: "Trincas",
    texto: "A solda não deve apresentar trincas.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
    semTolerancia: true,
  },
  {
    n: 2, titulo: "Fusão na solda e metal base",
    texto: "Fusão total deve existir entre as camadas de metal de solda e entre metal de solda e metal de base.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
    semTolerancia: true,
  },
  {
    n: 3, titulo: "Rechupes de cratera",
    texto: "Todos os rechupes de cratera devem estar preenchidos com solda para que o perfil da solda esteja como especificado, exceto para o final de soldas em ângulo intermitente situados fora de seu comprimento efetivo.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
  },
  {
    n: 4, titulo: "Perfis das soldas",
    texto: "Os perfis das soldas devem estar de acordo com a figura 5.4 da norma AWS D1.1. Para soldas de topo, a altura máxima do reforço em ambos os lados das juntas é de 3 mm.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
  },
  {
    n: 5, titulo: "Hora do ensaio",
    texto: "O ensaio visual para todos os aços pode ser realizado imediatamente após a conclusão e resfriamento da solda. O critério de aceitação para os aços ASTM A514, A517 e A709 Graus 100 e 100W deve ser baseado no ensaio visual realizado após pelo menos 48 horas da conclusão da solda.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
  },
  {
    n: 6, titulo: "Variação dimensional de soldas em ângulo",
    texto: "Uma solda em ângulo contínua pode ser permitida que tenha dimensão abaixo da medida nominal especificada em até 1/16\" (1,6 mm) sem correção, desde que a porção com medida inferior não exceda 10% do comprimento da solda.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
  },
  {
    n: 7, titulo: "Mordeduras", letra: "a",
    texto: "Para materiais com menos que 1\" (25 mm) de espessura, as mordeduras não devem exceder 1/32\" (1 mm), exceto que um máximo de 1/16\" (2 mm) é permitido desde que o comprimento acumulado em 12\" (305 mm) não ultrapasse 2\" (50 mm). Para materiais com espessura maior ou igual a 1\" (25 mm), as mordeduras não devem exceder 1/16\" (2 mm) de profundidade.",
    aplica: ["ESTATICA"],
  },
  {
    n: 7, titulo: "Mordeduras", letra: "b",
    texto: "Em membros primários, mordeduras não devem exceder 0,01\" (0,25 mm) de profundidade quando a solda for transversal aos esforços de tração, para quaisquer condições de projeto. Mordeduras não devem exceder 1/32\" (1 mm) de profundidade para todas as outras situações.",
    aplica: ["CICLICA", "TUBULAR"],
  },
  {
    n: 8, titulo: "Porosidade", letra: "a",
    texto: "Juntas de topo com penetração total transversais aos esforços de tração não devem ter porosidade visível. Para todas as outras soldas em chanfro e em ângulo, o somatório das porosidades visíveis com 1/32\" (1 mm) ou mais de diâmetro não deve exceder 3/8\" (10 mm) em qualquer polegada de solda linear e não deve ter mais que 3/4\" (19 mm) em qualquer 12\" (305 mm) de solda.",
    aplica: ["ESTATICA"],
  },
  {
    n: 8, titulo: "Porosidade", letra: "b",
    texto: "A quantidade de porosidade em juntas de ângulo não deve exceder a uma a cada 4\" (100 mm) de solda e o diâmetro máximo não deve exceder 3/32\" (2 mm). Exceção: para juntas de ângulo fixadas e soldadas na alma, a soma dos diâmetros das porosidades não devem exceder a 3/8\" (10 mm) em qualquer polegada de solda linear e não deve ter mais 3/4\" (20 mm) em qualquer 12\" (300 mm) de comprimento de solda.",
    aplica: ["CICLICA", "TUBULAR"],
  },
  {
    n: 8, titulo: "Porosidade", letra: "c",
    texto: "Juntas de topo com penetração total transversais aos esforços de tração não devem ter porosidade visível. Para todas as outras soldas em chanfro, a quantidade de porosidade não deve exceder a uma a cada 4\" (100 mm) de solda e o diâmetro máximo não deve exceder 3/32\" (2 mm).",
    aplica: ["CICLICA", "TUBULAR"],
  },
  {
    n: 9, titulo: "Desalinhamento para soldas de topo",
    texto: "O desalinhamento máximo permitido deve ser de 10% da menor espessura envolvida na junta ou 3 mm, o que for maior deve ser inaceitável.",
    aplica: ["ESTATICA", "CICLICA", "TUBULAR"],
  },
];

/**
 * Que itens da tabela 11 respondem por cada descontinuidade da legenda.
 *
 * ⚠ Nem todo código da legenda tem item na tabela. Respingo e abertura de arco são descontinuidades
 * de superfície que o PO-06 trata na limpeza, não no critério de aceitação da AWS — e dizer que
 * "não há critério" é mais honesto que apontar um item que não fala daquilo.
 */
const POR_DEFEITO = {
  TL: [1], TT: [1],
  FF: [2], FP: [2],
  CO: [4, 6], OV: [4], DI: [6],
  MO: [7], PO: [8],
  RE: [], AA: [],
};

/**
 * Os critérios que valem para um defeito, dado o tipo de estrutura.
 * @param {string} codigo  código da legenda (MO, PO, TL…)
 * @param {string} tipoEstrutura  ESTATICA | CICLICA | TUBULAR
 */
export function criteriosDoDefeito(codigo, tipoEstrutura) {
  const itens = POR_DEFEITO[codigo];
  if (!itens || !itens.length) return [];
  return TABELA_11.filter((c) => itens.includes(c.n) && (!tipoEstrutura || c.aplica.includes(tipoEstrutura)));
}
