// ─── QUANDO O FORNECEDOR ESCREVE "NÃO TENHO" EM VEZ DE MARCAR ──────────────────
//
// ⚠⚠ O CASO REAL (T67-011-R00, 10/09/2026). A SOUFER não marcou item nenhum como sem estoque —
// digitou **"SEM DISPONIBILIDADE"** no campo livre "Prazo de entrega" e pôs **R$ 2,00** no preço.
// O texto virou a string `"Prazo de entrega: SEM DISPONIBILIDADE | Pagamento: 28"` na observação da
// cotação, que nenhuma regra lia. R$ 2,00 era o menor preço da RM (o outro era R$ 7,80), ganhou
// sozinho, e o pedido 2037 saiu. Matheus: "sem querer eu gerei pedido".
//
// ⚠⚠ ISTO NÃO DECIDE NADA — SÓ ACENDE A LUZ. Transformar texto livre em "cotação recusada" seria
// adivinhar intenção: "sem disponibilidade para pronta entrega, temos para 30 dias" é uma proposta
// boa. O que a detecção faz é marcar a coluna no mapa e exigir confirmação explícita antes de virar
// pedido. Quem decide continua sendo o comprador — ele só não decide mais sem ver.
//
// ⚠ O CONSERTO DE VERDADE é o fornecedor ter onde marcar, e ele tem: o botão "Não tenho" na linha
// do item (`CotacaoFornecedorForm`). Isto aqui é a rede embaixo de quem escreve em vez de clicar.

/**
 * Os jeitos de dizer "não tenho" que aparecem de verdade nas propostas.
 *
 * ⚠ CADA UM EXIGE A NEGAÇÃO COLADA NO SUBSTANTIVO. "com disponibilidade" e "temos disponibilidade"
 * não podem casar — seriam falso positivo em proposta boa, e alarme falso em ferramenta de alarme
 * ensina a ignorar o alarme.
 */
const PADROES = [
  /\bsem\s+disponibilidade\b/,
  /\bsem\s+estoque\b/,
  /\bsem\s+material\b/,
  /\bsem\s+condi[çc][õo]es\s+de\s+atender\b/,
  /\bn[ãa]o\s+(?:temos|tenho|ternos)\b/,
  /\bn[ãa]o\s+trabalhamos\s+com\b/,
  /\bn[ãa]o\s+fornecemos\b/,
  /\bn[ãa]o\s+dispon[íi]ve[li]\b/,
  /\bindispon[íi]ve[li]\b/,
  /\bfora\s+de\s+linha\b/,
];

/** Tira acento e caixa, para "SEM DISPONIBILIDADE" e "sem disponibilidade" casarem igual. */
const normalizar = (v) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * O texto está dizendo que o fornecedor não tem o material?
 * @param {string|null|undefined} texto
 * @returns {boolean}
 */
export function textoDizIndisponivel(texto) {
  const t = normalizar(texto);
  if (!t) return false;
  // ⚠ O texto chega SEM acento e em minúsculas — é o que faz "SEM DISPONIBILIDADE", "Sem
  // Disponibilidade" e "não temos"/"nao temos" caírem todos no mesmo padrão.
  return PADROES.some((re) => re.test(t));
}

/**
 * A COTAÇÃO SE CONTRADIZ? — diz "não tenho" em texto livre E manda preço na mesma linha.
 *
 * ⚠⚠ É A CONTRADIÇÃO QUE IMPORTA, NÃO O TEXTO SOZINHO. Um fornecedor que escreve "sem
 * disponibilidade" e não põe preço nenhum está sendo claro, e o mapa já mostra a coluna vazia — não
 * há o que avisar. O que derrubou o pedido 2037 foi o texto dizendo uma coisa e o número dizendo
 * outra, com o número ganhando por ser o menor.
 *
 * @param {{observacao?:string|null, itens?:{precoUnit?:number, semEstoque?:boolean, observacao?:string|null}[]}} cotacao
 * @returns {{ contradiz:boolean, texto:string|null, itensComPreco:number }}
 */
export function contradicaoDeDisponibilidade(cotacao) {
  const itens = cotacao?.itens || [];
  const comPreco = itens.filter((i) => !i.semEstoque && Number(i.precoUnit) > 0);
  const candidatos = [cotacao?.observacao, ...itens.map((i) => i.observacao)];
  const texto = candidatos.find((t) => textoDizIndisponivel(t)) || null;
  return {
    contradiz: !!texto && comPreco.length > 0,
    texto: texto ? String(texto).trim() : null,
    itensComPreco: comPreco.length,
  };
}

/**
 * AS COTAÇÕES QUE PRECISAM DE UM "SIM, EU VI" ANTES DE VIRAR PEDIDO.
 *
 * ⚠⚠ A REGRA MORA AQUI PORQUE SÃO DUAS ROTAS QUE GERAM PEDIDO — por RM e por OP. A lição já foi
 * paga pela reconciliação do CMR (cron e botão divergiram) e pelo cálculo de imposto do mapa: duas
 * cópias da mesma regra viram duas respostas para a mesma pergunta, e a que estiver errada é
 * sempre a que o comprador está usando.
 *
 * ⚠ CONFIRMAÇÃO É POR COTAÇÃO, NÃO UM "OK" GERAL. Um botão "ignorar avisos" seria clicado por
 * reflexo na segunda vez. Quem confirma diz de QUAL fornecedor está falando.
 *
 * @param {{id:string, fornecedorNome?:string, observacao?:string|null, itens?:object[]}[]} cotacoes
 * @param {string[]} [confirmados] ids de cotação que o comprador confirmou nesta chamada
 * @returns {{id:string, fornecedor:string, texto:string|null}[]} vazio = pode gerar
 */
export function bloqueioPorIndisponibilidade(cotacoes, confirmados = []) {
  const ok = new Set(confirmados || []);
  return (cotacoes || [])
    .filter((c) => !ok.has(c.id))
    .map((c) => ({ c, d: contradicaoDeDisponibilidade(c) }))
    .filter(({ d }) => d.contradiz)
    .map(({ c, d }) => ({ id: c.id, fornecedor: c.fornecedorNome || "fornecedor", texto: d.texto }));
}
