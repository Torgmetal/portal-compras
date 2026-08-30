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

// ─── AS QUATRO MÁQUINAS ───────────────────────────────────────────────────────
// Vitor (30/08/2026): "Laser Tubo, Laser Perfil, Laser Cantoneira e Laser Chapa".
//
// ⚠⚠ E ISSO MUDA MAIS QUE O CUSTO: MUDA O PRAZO. As quatro cortam EM PARALELO, então o prazo da
// obra não é a soma das horas — é a máquina mais carregada. Uma lista com 40 h de perfil e 2 h de
// chapa leva 40 h, não 42. Somar as horas promete um prazo maior que o real e perde serviço; e a
// máquina gargalo é a única que precisa entrar na conversa de capacidade.
//
// ⚠ Cada uma tem R$/hora e setup PRÓPRIOS: reprogramar o laser de chapa não custa o mesmo que
// trocar a bitola no de perfil.
export const MAQUINAS = [
  { id: "LASER_PERFIL", nome: "Laser Perfil", rx: /\b(w\d|hp\d|perfil|viga|i\s?laminad|h\s?laminad|ue?\s?dobrad|u\s?laminad)/i },
  { id: "LASER_TUBO", nome: "Laser Tubo", rx: /\b(tubo|metalon|quadrad|redond(o|a)\s|din\s?2440)/i },
  { id: "LASER_CANTONEIRA", nome: "Laser Cantoneira", rx: /\b(cantoneira|\bl\s?\d|barra\s?chata|chato)/i },
  { id: "LASER_CHAPA", nome: "Laser Chapa", rx: /\b(chapa|ch\.?\s?#|xadrez|expandida|blank)/i },
];
export const MAQUINA_POR_ID = Object.fromEntries(MAQUINAS.map((m) => [m.id, m]));

/**
 * Em qual laser a peça é cortada.
 *
 * ⚠ O PALPITE É SUGESTÃO, NÃO VERDADE. O nome do perfil quase sempre diz a máquina ("W200x26.6" é
 * perfil, "CHAPA #8" é chapa), mas lista de cliente tem descrição livre. Quando não reconhece,
 * devolve null e a tela pergunta — atribuir à máquina errada erra o custo E o prazo de uma vez.
 */
export function maquinaDoPerfil(descricao) {
  const d = String(descricao || "").trim();
  if (!d) return null;
  return MAQUINAS.find((m) => m.rx.test(d))?.id || null;
}

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
  const linhas = pecas.map((l) => ({
    ...l,
    ...medidaDaLinha(l),
    // a máquina vem da peça quando alguém escolheu; senão, do palpite pelo nome do perfil
    maquina: l.maquina || maquinaDoPerfil(l.perfil),
  }));
  const pesoTotal = r2(linhas.reduce((a, l) => a + l.pesoKg, 0));

  // ⚠ peça sem máquina reconhecida NÃO é distribuída nem chutada: fica de fora da conta e sai
  // relatada. Atribuir ao laser errado erra o custo e o prazo de uma vez, e em silêncio.
  const semMaquina = linhas.filter((l) => !l.maquina);

  const cfgDe = (id) => (c.maquinas || {})[id] || {};
  const porMaquina = [];
  for (const m of MAQUINAS) {
    const doLaser = linhas.filter((l) => l.maquina === m.id);
    if (!doLaser.length) continue;
    const cfg = cfgDe(m.id);

    // ⚠ SETUP É POR PERFIL, NÃO POR BARRA — e por perfil DENTRO DE CADA MÁQUINA. Trocar de bitola
    // exige reprogramar e reposicionar: dez barras do mesmo perfil têm um setup, dez perfis
    // diferentes têm dez. Sem isso a lista variada parece tão barata quanto a repetida, e é a
    // variada que trava a máquina.
    const perfis = new Set(doLaser.map((l) => String(l.perfil || "").trim().toUpperCase()).filter(Boolean));
    const setupMin = perfis.size * n(cfg.setupMinPorPerfil);
    const minutosCorte = r2(doLaser.reduce((a, l) => a + l.minutos, 0));
    const minutosTotal = r2(minutosCorte + setupMin);

    // ⚠ DISPONIBILIDADE: máquina não produz 60 minutos por hora. Troca de material, manutenção e
    // parada fazem a hora de calendário render menos que a hora de corte. Sem o fator, o prazo
    // prometido não fecha e o custo/hora sai diluído no que ela não produziu.
    const disp = n(cfg.disponibilidadePct) > 0 ? n(cfg.disponibilidadePct) / 100 : 1;
    const horas = r2(minutosTotal / 60 / disp);
    const custoMaquina = r2(horas * n(cfg.valorHora));
    const custoEquipe = r2((cfg.equipe || c.equipe || []).reduce((a, e) => a + n(e.qtd) * n(e.valorHora) * horas, 0));

    porMaquina.push({
      id: m.id, nome: m.nome, linhas: doLaser.length, perfis: perfis.size,
      pesoKg: r2(doLaser.reduce((a, l) => a + l.pesoKg, 0)),
      minutosCorte, setupMin, minutosTotal, horas,
      custoMaquina, custoEquipe, custo: r2(custoMaquina + custoEquipe),
      valorHora: n(cfg.valorHora), disponibilidadePct: n(cfg.disponibilidadePct) || 100,
    });
  }

  const custoMaquina = r2(porMaquina.reduce((a, m) => a + m.custoMaquina, 0));
  const custoEquipe = r2(porMaquina.reduce((a, m) => a + m.custoEquipe, 0));
  const horasTotal = r2(porMaquina.reduce((a, m) => a + m.horas, 0));

  // ⚠⚠ O PRAZO É A MÁQUINA MAIS CARREGADA, NÃO A SOMA. Os quatro lasers cortam em paralelo: uma
  // lista com 40 h de perfil e 2 h de chapa leva 40 h, não 42. Somar promete um prazo maior que o
  // real e perde serviço — e a gargalo é a única que entra na conversa de capacidade.
  const gargalo = porMaquina.reduce((a, m) => (!a || m.horas > a.horas ? m : a), null);

  // ⚠ material só quando a TORG compra, e COM a perda: barra se compra inteira e sobra ponta.
  // Cobrar o peso líquido da peça é pagar a sobra do próprio bolso.
  const compraMaterial = c.material?.modalidade === "TORG";
  const perda = 1 + n(c.material?.perdaPct) / 100;
  const custoMaterial = compraMaterial ? r2(pesoTotal * perda * n(c.material?.precoKg)) : 0;

  const custo = r2(custoMaquina + custoEquipe + custoMaterial);

  // mesmo BDI da LQC: (1+adm+seguro+risco) / (1 − (impostos+financeiras+margem+comissões))
  const b = c.bdi || {};
  const pct = (k) => n(b[k]) / 100;
  const numer = 1 + pct("administracao") + pct("seguro") + pct("risco");
  const den = 1 - (pct("impostos") + pct("factoring") + pct("margem") + pct("comissoes"));
  const fator = den > 0 ? numer / den : 1;
  const preco = r2(custo * fator);

  return {
    linhas, porMaquina, pesoTotal,
    horasTotal, horasGargalo: gargalo?.horas || 0, gargalo: gargalo?.nome || null,
    custoMaquina, custoEquipe, custoMaterial, custo,
    bdiPct: r2((fator - 1) * 100), preco,
    // ⚠ os dois RESULTAM da conta; nenhum é entrada
    precoPorKg: pesoTotal > 0 ? r2(preco / pesoTotal) : null,
    precoPorHora: horasTotal > 0 ? r2(preco / horasTotal) : null,
    compraMaterial,
    // o que a tela precisa perguntar antes de o número valer
    semMaquina: semMaquina.map((l) => l.perfil || "(sem descrição)"),
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
    const a = porPerfil.get(k) || { perfil: k, barras: 0, pesoKg: 0, horas: 0, maquina: l.maquina };
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
