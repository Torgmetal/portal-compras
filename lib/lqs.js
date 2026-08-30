// ─── LQS — O ESTUDO DE CUSTO DO SERVIÇO ───────────────────────────────────────
// Vitor (30/08/2026): "precisamos criar uma espécie de LQC para serviço, pois precisamos ter essa
// informação (...) vamos deixar apenas o trabalho de corte de materiais, com a modalidade de
// comprarmos ou não material, será levando em consideração o tempo de máquina para o trabalho
// equipes; não seremos responsáveis por projetos, recebemos tudo do cliente, pedimos um ok e
// pronto, só executamos os cortes".
//
// ⚠⚠ A UNIDADE DE VENDA É A HORA DE MÁQUINA, NÃO O QUILO. É a diferença que define o negócio: duas
// barras do mesmo peso podem levar tempos muito diferentes — um perfil leve cheio de recortes
// ocupa a máquina mais que uma viga pesada com dois cortes retos. Vender por kg num serviço cuja
// restrição é a máquina é subsidiar justamente o trabalho mais caro.
//
// O R$/kg continua existindo, mas como RESULTADO — o número que se mostra ao cliente depois de a
// hora fechar a conta, nunca como base de cálculo.
//
// ⚠ SEM PROJETO, DE PROPÓSITO. "Recebemos tudo do cliente, pedimos um ok e pronto." Isso não é
// simplificação: é o que separa este serviço da proposta de estrutura, e precisa aparecer nos
// exclusos e na responsabilidade — se a lista do cliente estiver errada, o corte sai errado e a
// responsabilidade é de quem mandou a lista.
//
// ⚠⚠ PINTURA, SOLDA E JATEAMENTO SAÍRAM. Vitor: "antigamente pensava em ter o serviço de pintura
// também para ser ofertado, hoje não vejo mais sentido". Ficam no histórico das propostas antigas
// (a OS-001 é de corte), mas não são mais oferta.

/** O único serviço ofertado. Vive numa lista porque proposta antiga tem outros. */
export const SERVICOS = [
  { id: "CORTE", nome: "Corte de materiais", escopo: "corte, furação e recorte de perfis e chapas" },
];

/** Quem compra o material — e é a decisão que mais muda o preço. */
export const MODALIDADES_MATERIAL = [
  { id: "CLIENTE", nome: "Material do cliente",
    nota: "O cliente entrega o material na fábrica. A TORG executa o corte e devolve." },
  { id: "TORG", nome: "Material fornecido pela TORG",
    nota: "A TORG compra o material, corta e entrega. O preço inclui a matéria-prima." },
];

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;

/**
 * Tempo e peso de uma linha da lista do cliente.
 *
 * ⚠ `tempoMinBarra` é o tempo da BARRA INTEIRA, não do corte. É como o programador do laser mede,
 * e é o que a OS-001 já gravava — mudar a unidade agora invalidaria a única proposta que existe.
 */
export function medidaDaLinha(l) {
  const barras = n(l.qtdBarras);
  const comprimento = n(l.comprimento) || 12;
  const pesoKg = barras * comprimento * n(l.pesoKgM);
  const minutos = barras * n(l.tempoMinBarra);
  return { pesoKg: r2(pesoKg), minutos: r2(minutos), horas: r2(minutos / 60) };
}

/**
 * A conta do serviço.
 *
 * @param {object} c
 *   pecas[]        {perfil, pesoKgM, comprimento, qtdBarras, tempoMinBarra}
 *   maquina        {valorHora, setupMinPorPerfil, disponibilidadePct}
 *   equipe[]       {funcao, qtd, valorHora}  — acompanha a máquina
 *   material       {modalidade, precoKg, perdaPct, especificacao}
 *   bdi            {administracao, seguro, risco, impostos, factoring, margem, comissoes}
 */
export function calcularLqs(c = {}) {
  const pecas = Array.isArray(c.pecas) ? c.pecas : [];
  const linhas = pecas.map((l) => ({ ...l, ...medidaDaLinha(l) }));
  const pesoTotal = r2(linhas.reduce((a, l) => a + l.pesoKg, 0));

  // ⚠ O SETUP É POR PERFIL, NÃO POR BARRA. Trocar de bitola exige reprogramar e reposicionar; dez
  // barras do mesmo perfil têm um setup, dez perfis diferentes têm dez. Ignorar isso faz a lista
  // variada parecer tão barata quanto a repetida — e é a variada que trava a máquina.
  const perfis = new Set(linhas.map((l) => String(l.perfil || "").trim().toUpperCase()).filter(Boolean));
  const setupMin = perfis.size * n(c.maquina?.setupMinPorPerfil);
  const minutosCorte = r2(linhas.reduce((a, l) => a + l.minutos, 0));
  const minutosTotal = r2(minutosCorte + setupMin);

  // ⚠ e a DISPONIBILIDADE: máquina não produz 60 minutos por hora. Troca de chapa, manutenção e
  // parada fazem a hora de calendário render menos que a hora de corte. Sem isso o prazo prometido
  // não fecha e o custo/hora sai diluído no que a máquina não produziu.
  const disp = n(c.maquina?.disponibilidadePct) > 0 ? n(c.maquina.disponibilidadePct) / 100 : 1;
  const horasMaquina = r2(minutosTotal / 60 / disp);

  const custoMaquina = r2(horasMaquina * n(c.maquina?.valorHora));
  // a equipe acompanha a máquina: são as horas dela, não uma jornada à parte
  const custoEquipe = r2((c.equipe || []).reduce((a, e) => a + n(e.qtd) * n(e.valorHora) * horasMaquina, 0));

  // ⚠ material só entra quando a TORG compra — e com a perda, porque barra se compra inteira e
  // sobra ponta. Cobrar o peso líquido da peça é pagar a sobra do próprio bolso.
  const compraMaterial = c.material?.modalidade === "TORG";
  const perda = 1 + n(c.material?.perdaPct) / 100;
  const custoMaterial = compraMaterial ? r2(pesoTotal * perda * n(c.material?.precoKg)) : 0;

  const custo = r2(custoMaquina + custoEquipe + custoMaterial);

  // mesmo BDI da LQC: (1+adm+seguro+risco) / (1 − (impostos+financeiras+margem+comissões))
  const b = c.bdi || {};
  const pct = (k) => n(b[k]) / 100;
  const num = 1 + pct("administracao") + pct("seguro") + pct("risco");
  const den = 1 - (pct("impostos") + pct("factoring") + pct("margem") + pct("comissoes"));
  const fator = den > 0 ? num / den : 1;
  const preco = r2(custo * fator);

  return {
    linhas, perfis: perfis.size, pesoTotal,
    minutosCorte, setupMin, minutosTotal, horasMaquina,
    custoMaquina, custoEquipe, custoMaterial, custo,
    bdiPct: r2((fator - 1) * 100), preco,
    // ⚠ os dois RESULTAM da conta; nenhum é entrada
    precoPorKg: pesoTotal > 0 ? r2(preco / pesoTotal) : null,
    precoPorHora: horasMaquina > 0 ? r2(preco / horasMaquina) : null,
    compraMaterial,
  };
}

/**
 * A planilha comercial do serviço: uma linha por perfil.
 *
 * ⚠ agrupa POR PERFIL porque é assim que o cliente confere contra a lista que mandou — e é a
 * unidade que o programador do laser usa. Linha por barra daria centenas de linhas de nada.
 */
export function itensComerciaisLqs(resultado, { modalidade = "CLIENTE" } = {}) {
  const porPerfil = new Map();
  for (const l of resultado.linhas || []) {
    const k = String(l.perfil || "—").trim().toUpperCase();
    const a = porPerfil.get(k) || { perfil: k, barras: 0, pesoKg: 0, horas: 0 };
    a.barras += n(l.qtdBarras); a.pesoKg += l.pesoKg; a.horas += l.horas;
    porPerfil.set(k, a);
  }
  const itens = [...porPerfil.values()];
  const totalHoras = itens.reduce((a, x) => a + x.horas, 0) || 1;
  // o preço se distribui pelo TEMPO, não pelo peso — é o tempo que custa
  return itens.map((x, i) => ({
    item: `1.${i + 1}`,
    descricao: `${modalidade === "TORG" ? "Fornecimento e corte" : "Corte"} — ${x.perfil}`,
    un: "kg", quantidade: r2(x.pesoKg),
    valor: r2((resultado.preco * x.horas) / totalHoras),
    precoUnit: x.pesoKg > 0 ? r2((resultado.preco * x.horas) / totalHoras / x.pesoKg) : 0,
    barras: x.barras, horas: r2(x.horas),
  }));
}
