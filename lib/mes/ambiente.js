// ─── DE QUAL MUNDO É ESTE FATO ────────────────────────────────────────────────────────────────
//
// ⚠⚠ O MODO SOMBRA EXISTIA NO SCHEMA E NÃO ISOLAVA NADA (medido em 21/09/2026). `ambiente` está
// declarado em 8 models de fato, mas NENHUMA rota o passava: todas as funções de `lib/mes/*`
// tinham `ambiente = "PROD"` como default de parâmetro e ninguém sobrescrevia — uma delas gravava
// `ambiente: "PROD"` literal. Na prática só existia um mundo, e o laboratório escrevia dentro do
// operacional.
//
// Matheus (21/09/2026) decidiu que DEMO e PROD são **separados**: ele vai simular o operador em
// postos que já estão rodando de verdade enquanto o Syneco continua sendo o sistema oficial. Um
// teste não pode travar um posto que está produzindo, nem consumir o saldo de uma marca real.
//
// ⚠⚠ A FRONTEIRA É O RECURSO, E O AMBIENTE DELE NÃO SE SOBRESCREVE (achado do Codex, 21/09/2026).
// O terminal físico está num posto, e o posto é de um mundo só: a requisição SELECIONA o recurso
// (por código + ambiente), e sessão, evento, presença e quantidade herdam o ambiente dele. Deixar
// a requisição CARIMBAR o ambiente faria o mesmo recurso receber fato dos dois mundos — e aí as
// travas parciais, que são por `recursoId`, voltariam a ser compartilhadas.

export const AMBIENTE = { PROD: "PROD", DEMO: "DEMO" };
const VALIDOS = new Set(Object.values(AMBIENTE));

/**
 * O ambiente que veio de fora (query, corpo), recusando o que não for do domínio.
 *
 * ⚠ Ausência é PROD — é o mundo de verdade, e é o que o terminal da fábrica abre. Escolher o
 * laboratório tem de ser um ato explícito; o contrário faria um erro de digitação mandar
 * apontamento real para o limbo.
 *
 * ⚠ Valor fora do domínio é ERRO, não silencioso-PROD: "DEM", "demo " ou "producao" na URL viraria
 * apontamento no mundo errado sem ninguém perceber.
 */
export function ambientePedido(valor) {
  if (valor === undefined || valor === null || valor === "") return AMBIENTE.PROD;
  const v = String(valor).trim().toUpperCase();
  if (!VALIDOS.has(v)) return null;
  return v;
}

/** É um ambiente do domínio? */
export const ambienteValido = (v) => VALIDOS.has(v);

/**
 * AS ENTIDADES DESTE COMANDO SÃO DO MESMO MUNDO?
 *
 * ⚠⚠ A CHAVE ESTRANGEIRA NÃO GARANTE ISSO (achado do Codex, 21/09/2026). `operadorId` e
 * `recursoId` são ids; nada no banco impede um operador PROD de entrar num recurso DEMO, nem um
 * evento carimbado PROD de nascer numa sessão DEMO. Sem esta conferência, o isolamento seria uma
 * convenção — e convenção não sobrevive ao primeiro chamador novo.
 *
 * ⚠ Entidade ausente não é divergência: quem valida existência é o chamador, e transformar
 * "não achei" em "mundos diferentes" daria a mensagem errada para o operador.
 *
 * @param {Array<{rotulo:string, entidade:{ambiente?:string}|null|undefined}>} partes
 * @returns {string|null} a recusa, ou null quando está tudo no mesmo mundo
 */
export function divergenciaDeAmbiente(esperado, partes) {
  for (const { rotulo, entidade } of partes) {
    if (!entidade) continue;
    const a = entidade.ambiente;
    if (a && a !== esperado) {
      return `${rotulo} é do ambiente ${a} e este posto é ${esperado}. Um não enxerga o outro.`;
    }
  }
  return null;
}
