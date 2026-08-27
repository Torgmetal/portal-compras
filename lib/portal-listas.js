import "server-only";
import crypto from "node:crypto";

// ─── AS LISTAS DE ENGENHARIA NO PORTAL DO CLIENTE ─────────────────────────────
// Vitor (22/08/2026): "a LE e LPC deve ter permissão para o cliente baixar e nos casos de uma
// revisão disponibilizar uma lista nova para Download, informa a revisão atual e deixar com um
// alerta quando ele entrar para saber o que mudou".
//
// ⚠ REVISÃO DE LISTA É O QUE MAIS GERA DISCUSSÃO NUMA OBRA. O cliente confere o que vai receber
// contra a lista que ele tem na mão; quando a engenharia reimporta e as marcas mudam, quem está
// do outro lado não tem como saber — e a conversa vira "mas na minha lista estava assim". Por
// isso o portal não se limita a mostrar a lista de hoje: ele guarda a foto de cada revisão
// publicada e diz, marca por marca, o que entrou, o que saiu e o que mudou de quantidade ou peso.

export const LISTAS = {
  // ⚠⚠ A LPC É "LISTA DE PEÇAS POR CONJUNTO" — o conjunto E as peças dele. Vitor (26/08/2026): "hoje
  // na LPC você traz apenas as peças conjunto, não está listando as subpeças; isso acontece no
  // excel também".
  //
  // Estava filtrando `so: "CONJUNTO"` com a justificativa de que "croqui é peça de fábrica, não se
  // expede" — verdade para a LISTA DE EXPEDIÇÃO, onde quem embarca é o conjunto, e falso aqui: sem
  // as subpeças a LPC deixa de ser LPC e vira um índice de conjuntos. Na OP-112 saíam 47 linhas de
  // uma lista que tem as peças de cada um.
  LPC: { fonte: "LPC_IMPORT", so: null, comCroquis: true, nome: "Lista de Producao (LPC)", secao: "LPC" },
  LE: { fonte: "LE_IMPORT", so: null, nome: "Lista de Expedicao (LE)", secao: "LE" },
};

// Quantas marcas do diff ficam gravadas para exibição. Os contadores (nIncluidas…) são sempre o
// total real — o corte é só do detalhe, para uma revisão gigante não virar um Json de megabytes.
const LIMITE_DETALHE = 200;
// Teto de segurança da leitura. LPC de obra grande passa de 5.000 peças; acima disso a lista
// deixa de ser algo que se lê numa página e vira o arquivo pra baixar.
const LIMITE_ITENS = 20000;

export async function pecasDaLista(prisma, opId, chave) {
  const cfg = LISTAS[chave];
  if (!cfg || !opId) return [];
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId, fonte: cfg.fonte },
    select: { id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, tipoPeca: true, perfil: true, material: true },
    orderBy: { marca: "asc" },
    take: LIMITE_ITENS,
  });
  if (cfg.so) {
    // ⚠ o fallback existe porque nem toda LPC vem com tipoPeca preenchido (importação antiga).
    // Filtrar e devolver vazio esconderia a lista inteira do cliente; melhor mostrar tudo.
    const alvo = pecas.filter((p) => String(p.tipoPeca || "").toUpperCase() === cfg.so);
    return (alvo.length ? alvo : pecas).map((p) => ({ ...p, nivel: 0 }));
  }
  if (!cfg.comCroquis) return pecas.map((p) => ({ ...p, nivel: 0 }));

  // ── conjunto seguido das peças dele ──────────────────────────────────────────
  // ⚠ A ORDEM É O QUE FAZ A LISTA SER LEGÍVEL: alfabética pura joga T112A1, depois as peças de
  // outro conjunto, depois T112A10 — e ninguém acha o que compõe o quê. Aqui cada conjunto vem
  // seguido das suas peças, com `nivel` para a tela e a planilha recuarem.
  const links = await prisma.conjuntoCroqui
    .findMany({ where: { conjunto: { opId } }, select: { conjuntoId: true, croquiId: true } })
    .catch(() => []);
  const filhosDe = new Map();
  const ehFilho = new Set();
  for (const l of links) {
    filhosDe.set(l.conjuntoId, [...(filhosDe.get(l.conjuntoId) || []), l.croquiId]);
    ehFilho.add(l.croquiId);
  }
  const porId = new Map(pecas.map((p) => [p.id, p]));
  const ord = (a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true });

  const out = [];
  for (const p of pecas.filter((x) => !ehFilho.has(x.id)).sort(ord)) {
    out.push({ ...p, nivel: 0 });
    const filhos = (filhosDe.get(p.id) || []).map((id) => porId.get(id)).filter(Boolean).sort(ord);
    for (const f of filhos) out.push({ ...f, nivel: 1, conjunto: p.marca });
  }
  // ⚠ croqui órfão (sem conjunto conhecido) NÃO se perde: some da lista seria pior que aparecer
  // solto — o cliente pagou por ele igual.
  const vistos = new Set(out.map((x) => x.id));
  for (const p of pecas.filter((x) => !vistos.has(x.id)).sort(ord)) out.push({ ...p, nivel: 0 });
  return out;
}

// Impressão digital da lista: { marca: [qte, pesoKg] }. É o que permite dizer o que mudou na
// revisão seguinte — a PecaConjunto só guarda o estado de agora.
export function impressaoDe(pecas) {
  const m = {};
  for (const p of pecas) m[p.marca] = [p.qte || 0, Math.round(p.pesoTotalKg || 0)];
  return m;
}

export function hashDe(impressao) {
  const txt = Object.keys(impressao).sort().map((k) => `${k}:${impressao[k][0]}:${impressao[k][1]}`).join("|");
  return crypto.createHash("sha1").update(txt).digest("hex");
}

export function diffDe(antes, agora) {
  const incluidas = [], excluidas = [], alteradas = [];
  for (const marca of Object.keys(agora)) {
    const a = antes[marca], b = agora[marca];
    if (!a) incluidas.push({ marca, qtd: b[0], pesoKg: b[1] });
    else if (a[0] !== b[0] || a[1] !== b[1])
      alteradas.push({ marca, de: { qtd: a[0], pesoKg: a[1] }, para: { qtd: b[0], pesoKg: b[1] } });
  }
  for (const marca of Object.keys(antes)) if (!agora[marca]) {
    const a = antes[marca];
    excluidas.push({ marca, qtd: a[0], pesoKg: a[1] });
  }
  return { incluidas, excluidas, alteradas };
}

// A revisão que a ENGENHARIA deu à lista — é o número que o cliente vê no rodapé do projeto, e
// portanto o único que ele reconhece. Quando a obra tem mais de uma frente, cada uma tem a sua:
// mostrar só a maior seria inventar um número que não existe em lugar nenhum.
export async function rotuloDaEngenharia(prisma, { opId, opNumero, chave }) {
  const rot = (v) => `R${String(v).padStart(2, "0")}`;
  if (chave === "LPC") {
    // ⚠ LpcRevisao é chaveada pelo código SKA (T89A), não pelo número da OP (089) — casar por
    // opNumero direto devolve null sempre. Os códigos vêm da própria PecaConjunto da OP.
    const codigos = await prisma.pecaConjunto.findMany({
      where: { opId, fonte: "LPC_IMPORT" }, select: { opNumero: true }, distinct: ["opNumero"],
    });
    const nomes = codigos.map((c) => c.opNumero).filter(Boolean);
    if (!nomes.length) return null;
    const revs = await prisma.lpcRevisao.findMany({ where: { opNumero: { in: nomes } }, orderBy: { opNumero: "asc" } });
    if (!revs.length) return null;
    if (revs.length === 1) return rot(revs[0].revisao);
    return revs.map((r) => `${r.opNumero} ${rot(r.revisao)}`).join(" · ");
  }
  const les = await prisma.listaExpedicaoRevisao.findMany({ where: { opNumero }, orderBy: { detectadaEm: "desc" } });
  const porFrente = new Map();
  for (const l of les) if (!porFrente.has(l.frente) && l.revisao) porFrente.set(l.frente, l.revisao);
  const vals = [...porFrente.entries()];
  if (!vals.length) return null;
  if (vals.length === 1) return rot(vals[0][1]);
  return vals.map(([f, v]) => `${f} ${rot(v)}`).join(" · ");
}

// Tira a foto da lista se ela mudou desde a última publicada. Chamada quando o cliente abre o
// portal: não há cron, e não existe janela em que ele veja uma lista que ninguém registrou.
export async function sincronizarRevisao(prisma, { opId, opNumero, chave, pecas }) {
  if (!opId || !LISTAS[chave]) return null;
  // ⚠⚠ LISTA VAZIA NÃO VIRA REVISÃO. Vitor (26/08/2026): "o portal do cliente já subiu revisão na
  // lista de expedição e nem enviei para ele".
  //
  // Foi isto: a OP-112 teve a foto 1 tirada quando a lista tinha ZERO itens (a Engenharia ainda não
  // havia importado). Quando a lista real entrou, o conteúdo mudou e o portal criou a foto 2 — e a
  // tela anunciou "Revisão 2" para uma obra cuja lista acabava de nascer. Fotografar o vazio
  // garante uma revisão falsa no primeiro dado de verdade.
  if (!pecas?.length) return null;
  const impressao = impressaoDe(pecas);
  const hash = hashDe(impressao);
  const ultima = await prisma.portalListaRevisao.findFirst({
    where: { opId, fonte: chave }, orderBy: { seq: "desc" },
  });
  if (ultima?.hash === hash) return ultima;

  const rotulo = await rotuloDaEngenharia(prisma, { opId, opNumero, chave }).catch(() => null);
  const d = ultima?.impressao ? diffDe(ultima.impressao, impressao) : { incluidas: [], excluidas: [], alteradas: [] };
  try {
    return await prisma.portalListaRevisao.create({
      data: {
        opId, opNumero, fonte: chave, seq: (ultima?.seq || 0) + 1, rotulo,
        itens: pecas.length,
        pesoKg: Math.round(pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0)),
        hash, impressao,
        incluidas: d.incluidas.slice(0, LIMITE_DETALHE),
        excluidas: d.excluidas.slice(0, LIMITE_DETALHE),
        alteradas: d.alteradas.slice(0, LIMITE_DETALHE),
        nIncluidas: d.incluidas.length, nExcluidas: d.excluidas.length, nAlteradas: d.alteradas.length,
      },
    });
  } catch {
    // Corrida: dois acessos ao mesmo tempo tentaram criar o mesmo seq e o índice único barrou o
    // segundo. Quem ganhou já gravou a foto certa — basta reler.
    return prisma.portalListaRevisao.findFirst({ where: { opId, fonte: chave }, orderBy: { seq: "desc" } });
  }
}

// O que a tela precisa saber sobre a revisão. `comPeso` manda aqui também: o alerta do que mudou
// não pode ser a porta dos fundos por onde o peso sai quando a obra escolheu não divulgá-lo.
export function revisaoParaOCliente(rev, comPeso) {
  if (!rev) return null;
  const limpar = (x) => ({ marca: x.marca, qtd: x.qtd, ...(comPeso ? { pesoKg: x.pesoKg } : {}) });
  const limparAlt = (x) => ({
    marca: x.marca,
    de: { qtd: x.de?.qtd, ...(comPeso ? { pesoKg: x.de?.pesoKg } : {}) },
    para: { qtd: x.para?.qtd, ...(comPeso ? { pesoKg: x.para?.pesoKg } : {}) },
  });
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    seq: rev.seq,
    // ⚠⚠ NUNCA INVENTAR NÚMERO DE REVISÃO. Caía em `Revisão ${seq}` — o contador INTERNO do portal —
    // quando a lista da Engenharia não tinha revisão registrada. O cliente lia "Revisão 2" de um
    // documento que, nos nossos papéis, é R00: um número que não existe em lugar nenhum, na tela de
    // quem comprou a obra. Sem revisão da Engenharia, não se mostra revisão nenhuma.
    rotulo: rev.rotulo || null,
    daEngenharia: !!rev.rotulo,
    publicadaEm: rev.publicadaEm,
    vista: !!rev.vistoEm,
    // A primeira foto não tem contra o que comparar: lista nova não é lista alterada.
    // ⚠ "mudou" precisa de uma foto ANTERIOR de verdade — com o vazio fora, seq > 1 volta a
    // significar o que diz.
    mudou: rev.seq > 1 && (rev.nIncluidas > 0 || rev.nExcluidas > 0 || rev.nAlteradas > 0),
    nIncluidas: rev.nIncluidas, nExcluidas: rev.nExcluidas, nAlteradas: rev.nAlteradas,
    incluidas: arr(rev.incluidas).map(limpar),
    excluidas: arr(rev.excluidas).map(limpar),
    alteradas: arr(rev.alteradas).map(limparAlt),
  };
}
