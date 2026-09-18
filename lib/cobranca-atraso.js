// ─── QUEM COBRAR, E POR QUE UM E-MAIL POR FORNECEDOR ─────────────────────────
//
// Matheus (17/09/2026): "um botão para disparar e-mails para os pedidos/RMs que já estão com 1 dia
// em atraso, mas eu devo conseguir escolher qual fornecedor (…) preciso desse e-mail separado, um
// para cada fornecedor com sua respectiva RM/Pedido e suas datas."
//
// ⚠⚠ UM E-MAIL POR FORNECEDOR, COM A LISTA DENTRO — NUNCA UM POR PEDIDO. Medido em 17/09/2026: dos
// 24 pedidos atrasados, a SOUFER sozinha tem 10. Um e-mail por pedido encheria a caixa do
// `centroaco5@terra.com.br` com dez mensagens quase idênticas, e a primeira coisa que alguém faz
// com dez e-mails iguais é parar de ler os dez.
//
// ⚠ A conta de atraso NÃO é feita aqui: vem de `situacaoDoPedido`, a mesma de toda a tela. Duas
// telas que contam o mesmo atraso não podem discordar em um dia.
import { situacaoDoPedido, chaveFornecedor } from "@/lib/painel-prazos-rm";

/** A partir de quantos dias vencidos o pedido entra na lista de cobrança. */
export const ATRASO_MINIMO_DIAS = 1;

/**
 * Por que um grupo NÃO pode ser cobrado. `null` = pode.
 *
 * ⚠⚠ CADA UM DESTES É UM VAZAMENTO EVITADO, NÃO UM DETALHE (achado do Codex, 17/09/2026). Agrupar
 * pela raiz do CNPJ é certo para FILTRAR uma tela; para MANDAR E-MAIL é outra coisa — significa
 * contar a um contato o que foi comprado de outra unidade da empresa. Enquanto os destinos
 * coincidem isso é inofensivo (a SOUFER tem matriz e filial atrasadas e um contato só para as
 * duas); no dia em que divergirem, o certo é PARAR e deixar a pessoa decidir, não escolher o
 * primeiro e-mail da lista e mandar.
 */
export const BLOQUEIOS = {
  SEM_EMAIL: "sem-email",
  EMAIL_PARCIAL: "email-parcial",
  VARIOS_DESTINOS: "varios-destinos",
  SEM_CNPJ: "sem-cnpj",
};

export const MOTIVO_BLOQUEIO = {
  [BLOQUEIOS.SEM_EMAIL]: "sem e-mail cadastrado — cadastre no Vendor List",
  [BLOQUEIOS.EMAIL_PARCIAL]: "há pedido sem e-mail neste grupo — ele iria para o contato do outro",
  [BLOQUEIOS.VARIOS_DESTINOS]: "os pedidos deste CNPJ apontam para e-mails diferentes — cobre um a um",
  [BLOQUEIOS.SEM_CNPJ]: "CNPJ ausente ou inválido no pedido — não dá para garantir que é a mesma empresa",
};

/** CNPJ de verdade: 14 dígitos e não uma repetição como 00000000000000. */
const cnpjPlausivel = (chave) => /^cnpj:\d{8}$/.test(chave) && !/^cnpj:(\d)\1{7}$/.test(chave);

/** O e-mail do fornecedor daquele pedido, na ordem de confiança do cadastro. */
export const emailDoPedido = (p) =>
  p?.cotacao?.fornecedor?.email || p?.cotacao?.fornecedorEmail || null;

/**
 * Quantos dias o pedido está vencido. `0` quando não está.
 *
 * ⚠ Usa `diasAte` (o que falta, negativo quando passou), e não `atrasoDias`, que é o veredito de
 * quem JÁ chegou — pedido que chegou não se cobra.
 */
export function diasDeAtraso(pedido, agora = Date.now()) {
  const s = situacaoDoPedido(pedido, agora);
  if (s.situacao === "CHEGOU") return 0;
  return typeof s.diasAte === "number" && s.diasAte < 0 ? -s.diasAte : 0;
}

/**
 * Está atrasado o bastante para entrar na cobrança?
 *
 * ⚠⚠ O RECEBIDO PARCIAL ENTRA, e isso é de propósito. Na tela ele tem chip próprio e SAI de
 * "Atrasado" (a parcialidade é a informação mais útil lá). Para cobrar é o contrário: o pedido
 * 1833 da SOUFER está parcial E vencido há 29 dias — o que falta dele é exatamente o que precisa
 * ser cobrado. Por isso o número do modal é MAIOR que o do chip "Atrasado", e a tela diz isso.
 */
export const podeCobrar = (pedido, agora = Date.now()) =>
  diasDeAtraso(pedido, agora) >= ATRASO_MINIMO_DIAS;

/** A RM do pedido — ela chega por caminhos diferentes conforme quem montou o objeto. */
const rmDoPedido = (p) => p.rmItens?.[0]?.rm || p.rm || null;

/**
 * O prazo que foi COMBINADO lá atrás, quando ele não é o prazo atual.
 *
 * ⚠ Só aparece quando houve renegociação: repetir a mesma data duas vezes na tabela faria o
 * fornecedor procurar a diferença que não existe.
 */
function prazoRenegociado(p, previsao) {
  if (!p.prazoOriginal || !previsao) return null;
  return +new Date(p.prazoOriginal) === +new Date(previsao) ? null : p.prazoOriginal;
}

/** A linha que vai na tabela do e-mail e na conferência da tela. */
function linhaDoPedido(p, agora) {
  const s = situacaoDoPedido(p, agora);
  const rm = rmDoPedido(p);
  return {
    id: p.id,
    numeroPedido: p.numeroPedido || p.codigoPedido || null,
    rmNumero: rm?.numero || null,
    opNumero: rm?.op?.numero ?? null,
    opCliente: rm?.op?.cliente || "",
    previsao: s.previsao || null,
    prazoOriginal: prazoRenegociado(p, s.previsao),
    diasAtraso: diasDeAtraso(p, agora),
    parcial: p.statusEntrega === "PARCIAL",
    faturamentoDireto: !!p.faturamentoDireto,
  };
}

/**
 * Os fornecedores com pedido atrasado, cada um com os seus pedidos.
 *
 * @param {object[]} pedidos pedidos CRIADO, já com `cotacao`, `cnpj` e a RM
 * @param {number} agora
 * @returns {{chave:string, nome:string, email:string|null, pedidos:object[], bloqueio:string|null}[]}
 */
/**
 * Por que este grupo não pode receber um e-mail só. `null` = pode.
 *
 * ⚠⚠ A ORDEM É DA CAUSA MAIS GRAVE PARA A MENOS. Todas param o envio igual; o que muda é a frase
 * que a pessoa lê para saber o que consertar.
 */
function motivoDoBloqueio(chave, destinos, semDestino) {
  if (destinos.size === 0) return BLOQUEIOS.SEM_EMAIL;
  if (destinos.size > 1) return BLOQUEIOS.VARIOS_DESTINOS;
  if (semDestino > 0) return BLOQUEIOS.EMAIL_PARCIAL;
  // ⚠⚠ SÓ CNPJ VÁLIDO AUTORIZA AGRUPAR (achado do Codex, 18/09/2026). Antes só o fallback por
  // NOME era barrado, mas `chaveFornecedor` também produz `doc:<dígitos>` para documento curto ou
  // fictício — dois cadastros com "0" no campo e um contato em comum entrariam no mesmo e-mail.
  // Agrupar é afirmar "é a mesma empresa", e só a raiz do CNPJ prova isso.
  if (!cnpjPlausivel(chave)) return BLOQUEIOS.SEM_CNPJ;
  return null;
}

export function agruparParaCobranca(pedidos, agora = Date.now()) {
  const grupos = new Map();

  for (const p of pedidos || []) {
    if (!podeCobrar(p, agora)) continue;
    const chave = chaveFornecedor(p);
    if (!chave) continue;
    if (!grupos.has(chave)) grupos.set(chave, { chave, nomes: new Map(), destinos: new Set(), semDestino: 0, pedidos: [] });
    const g = grupos.get(chave);
    g.pedidos.push(linhaDoPedido(p, agora));
    const nome = (p.fornecedorNome || "").trim();
    if (nome) g.nomes.set(nome, (g.nomes.get(nome) || 0) + 1);
    const email = emailDoPedido(p);
    // ⚠⚠ PEDIDO SEM DESTINO É CONTADO, NÃO IGNORADO (achado do Codex, 18/09/2026). Ignorando, um
    // grupo com um pedido endereçado e outro sem e-mail ficava com UM destino no conjunto — e o
    // pedido órfão, com o token público dele, saía no e-mail do contato do primeiro.
    if (email) g.destinos.add(email.trim().toLowerCase());
    else g.semDestino++;
  }

  return [...grupos.values()]
    .map(({ chave, nomes, destinos, semDestino, pedidos: lista }) => ({
      chave,
      // ⚠ O rótulo é o nome MAIS USADO, mesma regra do filtro de fornecedor: pegar o último daria
      // "R SIMIONI IND E COM LTDA" ou "R SIMIONI" conforme a ordem da carga.
      nome: [...nomes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] || "—",
      email: destinos.size === 1 && semDestino === 0 ? [...destinos][0] : null,
      bloqueio: motivoDoBloqueio(chave, destinos, semDestino),
      // ⚠ Do mais atrasado para o menos: quem abre o e-mail lê as primeiras linhas.
      pedidos: lista.sort((a, b) => b.diasAtraso - a.diasAtraso),
    }))
    // ⚠ E os fornecedores na mesma ordem, pelo pedido mais antigo de cada um.
    .sort((a, b) => b.pedidos[0].diasAtraso - a.pedidos[0].diasAtraso);
}
