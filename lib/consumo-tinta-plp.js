import "server-only";
import { calcularQuantidadeTinta } from "./tinta-catalogo";

// ─── QUANTA TINTA A OBRA CONSOME, PELO PLP ─────────────
//
// Vitor (07/09/2026): "de acordo com cada PLP você consegue já deixar informado a quantidade de
// tinta que usaria para a pintura de cada estrutura?". Consegue — a conta já existia (o Comercial
// usa no estudo de pintura), e o que faltava era o dado chegar até aqui.
//
// ⚠⚠ O SÓLIDOS POR VOLUME É O ELO, E ELE ESTAVA SOLTO. Sem SV não há rendimento, sem rendimento não
// há litro. Ele já existia no portal — `EditarPlp` usa `t.solidosVol` para calcular a camada úmida —
// mas nunca era GRAVADO no plano: morria dentro do cálculo. Desde 07/09/2026 o editor copia o SV
// para a demão junto com a secagem, e é de lá que esta lib lê.
//
// ⚠ LÊ DO PLANO, NÃO DO CATÁLOGO, de propósito. O plano é o documento da obra e tem de continuar
// respondendo sozinho anos depois, mesmo que o boletim mude ou a tinta saia de linha. O catálogo
// entra só como resgate para as PLPs antigas, preenchidas antes de o campo existir.
//
// ⚠⚠ DOIS CATÁLOGOS DE TINTA NO PORTAL, e isso é dívida conhecida:
//   · `ProdutoTinta`  — 3 registros, campo `solidosVol`, alimentado por boletim técnico; é o que o
//                       editor do PLP oferece.
//   · `TintaProduto`  — 60 registros, campo `svPct`, do catálogo semeado; é o que o estudo do
//                       Comercial usa.
// Onde os dois têm a mesma tinta eles concordam (Hardtop Flexi: 64% nos dois), mas nenhum cobre
// todas as tintas que as obras usam — INDUSTHANE, W-POXI ZSP 315 e Jotamastic 90 não estão em
// nenhum. Por isso o resgate tenta os dois, e por isso o campo digitável no PLP não é opcional:
// é o único caminho que não depende de cadastro.
//
// ⚠ JOTAMASTIC 90 ≠ JOTAMASTIC 80. O casamento por nome exige contenção exata justamente para não
// aceitar o vizinho de prateleira: errar o SV erra o litro, e o litro vira ordem de compra.

const PERDAS_PADRAO = 15; // % — mesmo padrão do estudo de pintura
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Sólidos por volume de uma demão, na ordem de confiança:
 * o que está no plano → o boletim vinculado → o catálogo, casando pelo nome.
 *
 * @returns {{sv: number, origem: string} | null}
 */
export function solidosDaDemao(demao, catalogos = {}) {
  const doPlano = Number(String(demao?.solidosVol ?? "").replace(",", "."));
  if (doPlano > 0) return { sv: doPlano, origem: "PLP" };

  const { produtoTinta = [], tintaProduto = [] } = catalogos;
  if (demao?.produtoId) {
    const t = produtoTinta.find((x) => x.id === demao.produtoId);
    if (t?.solidosVol > 0) return { sv: t.solidosVol, origem: "boletim" };
  }
  const p = norm(demao?.produto);
  if (!p) return null;
  for (const [lista, campo, rotulo] of [[produtoTinta, "solidosVol", "boletim"], [tintaProduto, "svPct", "catálogo"]]) {
    const hit = lista.find((x) => {
      const n = norm(x.produto || x.nome);
      return n.length > 5 && (p.includes(n) || n.includes(p)) && x[campo] > 0;
    });
    if (hit) return { sv: hit[campo], origem: rotulo };
  }
  return null;
}

/**
 * % de diluição da demão, ou null quando o plano não diz.
 *
 * ⚠⚠ CAMPO VAZIO NÃO É ZERO, E NÃO É 10. A primeira versão desta lib caía num `|| 10` — "é o mais
 * comum" — e isso produzia dois números que não conversam: a tela mostrava "diluição 10%" ao lado
 * de uma camada úmida calculada com outro valor. Pior, o pintor mede o pente contra um número que
 * ninguém especificou. Sem diluição no plano, a resposta é dizer que falta.
 *
 * ⚠ `Number("")` é 0, não NaN — foi por isso que a guarda antiga nunca disparou.
 */
export function diluicaoPct(demao) {
  const bruto = demao?.diluicaoPct ?? demao?.diluicao;
  if (bruto == null || String(bruto).trim() === "") return null;
  const v = Number(String(bruto).replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/**
 * Espessura SECA especificada da demão, em µm.
 *
 * ⚠ MÍNIMA PRIMEIRO, MÁXIMA COMO RESGATE. O plano especifica um valor e a mínima é a que o medidor
 * tem de encontrar — mas nem todo PLP preenche a mesma coluna: a OP-112 tem 100 em `espessuraMax` e
 * nada em `espessuraMin`. Ler só uma das duas mostrava "—" com o número gravado ao lado.
 */
export function espessuraSeca(demao) {
  return Number(demao?.espessuraMin) || Number(demao?.espessuraMax) || null;
}

/**
 * Camada ÚMIDA da demão, em µm — o número que o pente tem de marcar na hora.
 *
 * ⚠⚠ É O DADO QUE O PINTOR USA. Vitor (07/09/2026): "a quantidade de espessura úmida é muito
 * importante, precisa constar na parte de documento para o funcionário". A seca só se mede depois
 * de curar; a úmida é a única verificação possível enquanto ainda dá para corrigir.
 *
 * ⚠ CALCULA QUANDO NÃO ESTÁ GRAVADA. A fórmula é a da planilha da Qualidade e já vive no editor do
 * PLP: EPU = EPS × (100 + %diluição) ÷ SV. Com ela a úmida sai para QUALQUER espessura e QUALQUER
 * diluição, enquanto a tabela do boletim só cobre as linhas que ele listou.
 *
 * ⚠ SEM DILUIÇÃO NÃO SE CHUTA. A úmida depende dela; supor 10% porque é comum daria um número
 * plausível e errado, e o pintor mede contra ele. Devolve o que falta, para alguém completar o PLP.
 *
 * @returns {{umida: number, origem: "PLP"|"calculada"} | {umida: null, falta: string}}
 */
export function camadaUmida(demao, sv) {
  const gravada = Number(String(demao?.camadaUmida ?? "").replace(",", "."));
  if (gravada > 0) return { umida: Math.round(gravada), origem: "PLP" };

  const eps = espessuraSeca(demao);
  const dil = diluicaoPct(demao);
  if (!(sv > 0)) return { umida: null, falta: "sólidos por volume" };
  if (!eps) return { umida: null, falta: "espessura seca" };
  if (dil == null) return { umida: null, falta: "% de diluição" };
  return { umida: Math.round((eps * (100 + dil)) / sv), origem: "calculada" };
}

/**
 * Consumo de tinta de uma demão para uma área.
 *
 * @param {object} demao entrada de `PlanoPintura.demaos`
 * @param {number} areaM2 área a pintar, em m²
 * @param {object} [catalogos] `{ produtoTinta, tintaProduto }` para o resgate
 * @returns {{produto, cor, espessura, sv, origemSv, rendimento, litros, galoes, diluente, falta}}
 */
export function consumoDaDemao(demao, areaM2, catalogos = {}) {
  const s = solidosDaDemao(demao, catalogos);
  const esp = espessuraSeca(demao);
  const dil = diluicaoPct(demao);
  const base = {
    ordem: demao?.ordem ?? null, camada: demao?.nome || null,
    produto: demao?.produto || null, fabricante: demao?.fabricante || null,
    cor: demao?.cor || null, espessura: esp, secagem: demao?.secagem || null,
    sv: s?.sv ?? null, origemSv: s?.origem ?? null, diluicaoPct: dil,
    // ⚠ a úmida vai junto do consumo porque é o mesmo dado de origem — e porque é ela que o
    // documento do pintor precisa mostrar.
    ...(() => { const u = camadaUmida(demao, s?.sv); return { umida: u.umida, origemUmida: u.origem || null, faltaUmida: u.falta || null }; })(),
  };
  if (!s || !esp || !(areaM2 > 0)) {
    // ⚠ diz O QUE falta em vez de devolver zero: zero de tinta lê como "não precisa comprar".
    const falta = !s ? "sólidos por volume" : !esp ? "espessura seca" : "área de pintura";
    return { ...base, rendimento: null, litros: null, galoes: null, diluente: null, falta };
  }
  const c = calcularQuantidadeTinta({
    svPct: s.sv, espessuraMicra: esp, areaM2, demaos: 1,
    percPerdas: PERDAS_PADRAO, diluentePct: dil ?? 0,
  });
  return { ...base, rendimento: c.rendimentoPratico, litros: c.litros, galoes: c.galoes,
           // ⚠ sem diluição no plano o litro de tinta continua válido (não depende dela), mas o de
           // DILUENTE não existe — devolver 0 leria como "não precisa diluir".
           diluente: dil == null ? null : c.diluente, falta: null };
}

/**
 * Consumo de todas as demãos de um plano.
 *
 * @param {object} plano registro de PlanoPintura
 * @param {number} areaM2 área a pintar
 * @param {object} [catalogos]
 */
export function consumoDoPlano(plano, areaM2, catalogos = {}) {
  const demaos = Array.isArray(plano?.demaos) ? plano.demaos : [];
  const camadas = demaos.map((d) => consumoDaDemao(d, areaM2, catalogos));
  const somar = (k) => camadas.reduce((s, c) => s + (c[k] || 0), 0);
  return {
    camadas,
    // ⚠ as cores são POR ITEM, não por demão — na OP-067 o mesmo sistema pinta plataforma de preto
    // e guarda-corpo de amarelo. Ver a nota no modelo PlanoPintura.
    coresPorEstrutura: Array.isArray(plano?.itens) ? plano.itens : [],
    total: {
      litros: Math.round(somar("litros") * 100) / 100,
      galoes: somar("galoes"),
      diluente: Math.round(somar("diluente") * 100) / 100,
      // quantas camadas não fecharam a conta, e por quê — o total sem isso é meia verdade
      incompletas: camadas.filter((c) => c.falta).length,
    },
  };
}
