// ─── O QUE A PEÇA É, PELA LISTA — não pela classe do IFC ─────────────────────────────────────
//
// ⚠⚠ POR QUE NÃO DÁ PARA USAR O TIPO DO IFC. Vitor (05/09/2026): "o filtro de tipo precisa dar uma
// verificada, pois quando colocamos em vigas ele seleciona algumas coisas sem sentido; teria que
// pegar nas listas os nomes das peças — seria colunas, tesouras, terças, etc.".
//
// O modelo classifica pela ENTIDADE do IFC (IfcBeam, IfcColumn…), e o Tekla exporta como IfcBeam
// quase tudo que é barra: terça, tesoura, contraventamento, tirante e a viga de verdade caem no
// mesmo balde. Filtrar por "Viga" trazia meia obra.
//
// A LISTA sabe o que a peça é, porque quem desenhou escreveu: a descrição do CONJUNTO na LPC vem
// como "VIGA V1", "TESOURA T3", "TERÇA...", "COLUNA C12". É esse nome que o cliente reconhece.
//
// ⚠ Croqui e avulsa costumam trazer o PERFIL na descrição ("CH6.40X100", "W200X35.9", "L2.1/2X1/4")
// — isso não é tipo de peça, é bitola. Quando a descrição é perfil, esta função devolve null e o
// visualizador cai no tipo do IFC, que para chapa e parafuso acerta.

/** Primeira palavra da descrição, sem acento, maiúscula e sem pontuação de borda. */
function primeira(desc) {
  const t = String(desc || "").trim();
  if (!t) return "";
  return t.split(/[\s\-/,;]+/)[0]
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z.]/g, "");
}

/**
 * Parece bitola de perfil? (CH6.40X100, W200X35.9, UE200X75X20X3.00, L2.1/2"X1/4", TB42.40X2.65,
 * FR3/4"…) O que caracteriza é ter DÍGITO — nome de peça não tem.
 */
const ehPerfil = (desc) => /\d/.test(String(desc || "").trim().split(/\s+/)[0] || "");

// Sinônimos e abreviações que a Engenharia usa na lista. O valor é como o cliente lê na tela.
const NOMES = {
  VIGA: "Viga", VIGAS: "Viga",
  COLUNA: "Coluna", COLUNAS: "Coluna", PILAR: "Coluna",
  TESOURA: "Tesoura", TRELICA: "Treliça", TRELICAS: "Treliça",
  TERCA: "Terça", TERCAS: "Terça",
  CONTRAVENTAMENTO: "Contraventamento", CONTRAV: "Contraventamento",
  TIRANTE: "Tirante", CORRENTE: "Corrente", LONGARINA: "Longarina",
  MAO: "Mão-francesa", MAOFRANCESA: "Mão-francesa",
  "SUP.": "Suporte", SUP: "Suporte", SUPORTE: "Suporte",
  PORTICO: "Pórtico", ESCADA: "Escada", PLATAFORMA: "Plataforma",
  "G.C": "Guarda-corpo", GC: "Guarda-corpo", GUARDACORPO: "Guarda-corpo", GUARDA: "Guarda-corpo",
  CORRIMAO: "Corrimão", GRADE: "Grade", PISO: "Piso",
  TELHA: "Telha", RUFO: "Rufo", CALHA: "Calha", CUMEEIRA: "Cumeeira",
  CHAPA: "Chapa", INSERTO: "Inserto", GUARNICAO: "Guarnição",
  PARAFUSO: "Parafuso", CHUMBADOR: "Chumbador", BASE: "Base", ENRIJECEDOR: "Enrijecedor",
  CANTONEIRA: "Cantoneira", MONTANTE: "Montante", DIAGONAL: "Diagonal", BANZO: "Banzo",
  ESCORA: "Escora", TRAVESSA: "Travessa", PENDURAL: "Pendural",
};

/**
 * O tipo funcional da peça a partir da descrição da lista.
 * @returns {string|null} "Viga", "Tesoura"… ou null quando a descrição é perfil/vazia.
 */
export function tipoDaDescricao(descricao) {
  const d = String(descricao || "").trim();
  if (!d || ehPerfil(d)) return null;
  const p = primeira(d);
  if (!p) return null;
  if (NOMES[p]) return NOMES[p];
  // ⚠ nome que não está na lista de sinônimos ENTRA assim mesmo, capitalizado: a obra do cliente
  // pode ter peça que a nossa tabela não previu, e engolir isso devolveria o problema de agora —
  // a peça cairia no balde errado em vez de aparecer com o nome que a Engenharia deu.
  if (p.length < 3) return null;
  return p.charAt(0) + p.slice(1).toLowerCase();
}

/** marca → tipo funcional, para as peças que a lista sabe nomear. */
export function tiposPorMarca(pecas = []) {
  const m = {};
  for (const p of pecas) {
    const t = tipoDaDescricao(p?.descricao);
    if (t && p?.marca) m[String(p.marca).trim().toUpperCase()] = t;
  }
  return m;
}
