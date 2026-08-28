import "server-only";
import { prisma } from "./prisma";
import { rastreioDaOp, rastreioDaPeca, ehMateriaPrimaDePeca } from "./rastreio-peca";
import { consumiveisPorConjunto } from "./consumivel-solda";
import { ehItemComprado } from "./item-comprado";

// Monta o conteúdo da §02 (Desenhos as-built) do Data Book a partir da LPC
// (PecaConjunto + ConjuntoCroqui) cruzada com os certificados de matéria-prima.
// Por CONJUNTO, lista as POSIÇÕES (croquis) que o compõem, com material, qtd no
// conjunto, RASTREABILIDADE (nº da corrida) e Nº DO CERTIFICADO.
//
// ── A FONTE DO R É O MOTOR DE RASTREIO, NÃO UM PALPITE POR ESPESSURA ────────────────────────
//
// Vitor (20/08/2026), olhando a §02 no PDF: "aqui acho que esteja fazendo confusão, precisa trazer
// a informação real; você colocar dois certificados na mesma peça, ou sei lá se está entendendo
// que o A36 seja uma peça — sendo honesto, está bagunçado". E: "precisamos ter certeza desses
// certificados de acordo com o que está marcado nos croquis, conforme alinhamos na página do PCP".
//
// O que havia aqui casava o certificado por GRAU + FORMA + ESPESSURA e devolvia TODOS os que
// batiam. Como a OP recebe mais de uma chapa da mesma espessura, cada posição saía com dois, três
// certificados — candidatos impressos como se fossem fato. Uma peça é cortada de UMA chapa, de UMA
// corrida; listar duas não é rastrear, é adivinhar em voz alta.
//
// Quem sabe a resposta é `lib/rastreio-peca.js` — o MESMO motor que carimba o R no croqui que vai
// pro chão de fábrica: consumo FIFO pela entrega mais antiga, respeitando a troca registrada pelo
// Almoxarifado, e só peça CORTADA ganha R. Assim o data book afirma exatamente o que está no papel
// que o soldador teve na mão.
//
// Medido na OP-067: o motor cobre 100% das 8.757 posições e dá UM R em 4.686 das 4.745 peças
// definidas (as 59 restantes são peças cujo peso atravessa mesmo duas entregas). Na T67CT-P42, que
// o Vitor apontou, o casamento antigo mostrava R 260097 + R 260199 — e o R correto é o 260140.
//
// 🚫 Peça sem R não vira "sem certificado". Ela tem um MOTIVO: aguarda corte, foi cortada antes de
// qualquer entrega (sobra de estoque) ou não há material dela no CMR. São coisas diferentes e a
// §02 diz qual é.

const extractOP = (t) => (String(t).match(/\d+/)?.[0] || "").padStart(3, "0");

// (O casador por grau + espessura/bitola que existia aqui foi removido junto com o resto: ele era
// o que produzia os dois certificados na mesma peça. Quem responde agora é rastreio-peca.js.)

export async function montarSecaoLpc(opNumeroBook) {
  const op = extractOP(opNumeroBook);
  const allObras = (await prisma.pecaConjunto.findMany({ distinct: ["opNumero"], select: { opNumero: true } }))
    .map((o) => o.opNumero).filter(Boolean).filter((o) => extractOP(o) === op);
  if (!allObras.length) return { conjuntos: [], totalPosicoes: 0, semCertificado: 0, totalCertificados: 0, geradoEm: null };

  const opRow = await prisma.oP.findFirst({ where: { numero: op }, select: { id: true, numero: true } });

  const [conjuntos, totalCertificados, rastreio, consumiveis] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { opNumero: { in: allObras }, tipoPeca: "CONJUNTO" },
      select: {
        marca: true, descricao: true, qte: true,
        conjuntoCroquis: { select: { qtdNoConjunto: true, croqui: { select: { marca: true, descricao: true, material: true, perfil: true } } } },
      },
      orderBy: { marca: "asc" },
    }),
    // ⚠ só matéria-prima: tinta e consumível de solda entram no CMR como MATERIAL, mas têm seção
    // própria (§15 e §06). Contá-los aqui inflava "certificados da OP" na §02 — na OP-106, 3 dos 10
    // eram tinta, catalisador e diluente da WEG. (Vitor, 28/08/2026.)
    prisma.documentoQualidade.findMany({ where: { categoria: "MATERIAL", ativo: true, opNumero: op }, select: { nome: true } })
      .then((rows) => rows.filter((r) => ehMateriaPrimaDePeca(r.nome)).length),
    opRow ? rastreioDaOp(opRow.numero, opRow.id) : Promise.resolve({ porMarca: new Map(), resumo: null }),
    // O ARAME DO CONJUNTO. Vitor (20/08/2026): "nos conjuntos trazer o R do arame de solda".
    // É o mesmo cálculo que escreve o consumível no carimbo do desenho do conjunto — o lote
    // vigente na data em que ELE foi soldado, não na data em que o data book foi gerado.
    opRow ? consumiveisPorConjunto(opRow.id) : Promise.resolve(new Map()),
  ]);


  let totalPosicoes = 0, semCertificado = 0;
  const situacoes = { R_DEFINIDO: 0, AGUARDANDO_CORTE: 0, ESTOQUE: 0, SEM_MATERIAL: 0, SEM_DADO: 0 };
  const out = [];
  for (const cj of conjuntos) {
    const posicoes = (cj.conjuntoCroquis || []).map((cc) => {
      const c = cc.croqui || {};
      totalPosicoes++;
      // marca+perfil: a mesma marca aparece em sub-obras diferentes com perfis diferentes
      // (T67CT-P42 é CH16 na T67 e U200 na T67CT) — só a marca traria o R da peça errada.
      const r = rastreioDaPeca(rastreio, c.marca, c.perfil);
      // a peça que o motor nem conhece (LPC sem perfil, importação parcial) é SEM_DADO — não é
      // "sem certificado": a diferença é entre não ter material e não termos como saber.
      const situacao = r?.situacao || "SEM_DADO";
      situacoes[situacao] = (situacoes[situacao] || 0) + 1;
      const certificados = situacao === "R_DEFINIDO"
        ? (r.usadas || []).map((u) => ({
            indiceR: u.rastreio || null, certificado: u.certificado || null,
            corrida: u.corrida || null, fornecedor: u.fornecedor || null, nf: u.nf || null,
          }))
        : [];
      if (!certificados.length) semCertificado++;
      return {
        marca: c.marca || "—", material: c.material || null, perfil: c.perfil || null,
        qtd: cc.qtdNoConjunto || 1, certificados, situacao,
        criterio: r?.criterio || null,          // unica | fifo | troca — POR QUE esse R
        semCorrida: !!r?.semCorrida,            // o R vale, falta o Almoxarifado lançar a corrida
        troca: r?.troca || null,                // o Almoxarifado separou outro fardo: isso é fato, não FIFO
      };
    });
    const arame = consumiveis.get(cj.marca) || null;
    if (posicoes.length) {
      out.push({
        marca: cj.marca, descricao: cj.descricao || null, qte: cj.qte || 1, posicoes,
        consumivel: arame ? {
          indiceR: arame.rastreio || null, material: arame.material || null,
          lote: arame.lote || null, certificado: arame.certificado || null,
          // "emissao" = conjunto ainda não soldado; o lote é o que está na máquina hoje. Sai
          // marcado pra ninguém ler como fato consumado.
          previsto: arame.origem === "emissao",
          // solda que atravessou troca de lote: mais de um arame encostou nesta peça
          janela: arame.janela || null,
        } : null,
      });
    }
  }

  // ── PEÇA AVULSA TAMBÉM É PEÇA ──────────────────────────────────────────────────────────────
  //
  // A §02 só listava conjunto → posições, então peça que não entra em conjunto nenhum
  // (a "avulsa": vai do corte direto pro acabamento) simplesmente não existia no data book. Na
  // OP-067 são 284 peças, 20 toneladas, com R definido em 177 delas — material fabricado e
  // embarcado, sem uma linha de rastreabilidade no livro.
  //
  // Entram num grupo próprio no fim, com a mesma coluna de R das posições.
  //
  // ⚠ Só as que TÊM PERFIL. Sem perfil não há material identificado e o motor nem as considera —
  // é o caso das 576 linhas de LE antiga da OP-067, que trazem só peso. Listá-las produziria 576
  // linhas de "sem dado" que não ajudam ninguém a rastrear nada.
  const soltas = (opRow ? await prisma.pecaConjunto.findMany({
    where: { opId: opRow.id, perfil: { not: null }, conjuntoCroquis: { none: {} }, croquiConjuntos: { none: {} } },
    select: { marca: true, descricao: true, material: true, perfil: true, qte: true, pesoTotalKg: true, tipoPeca: true },
    orderBy: { marca: "asc" },
  }) : [])
    // 🚫 item COMPRADO pronto fica fora: "T674 Parabolt 5/8 x 3.1/2" não é cortado nem soldado, e
    // o certificado dele é da §05 (fixadores). Aparecia aqui como "sem material no CMR" — um furo
    // de rastreabilidade que não existe. Ver lib/item-comprado.js.
    .filter((pc) => !ehItemComprado(pc));

  if (soltas.length) {
    const posicoes = soltas.map((pc) => {
      totalPosicoes++;
      const r = rastreioDaPeca(rastreio, pc.marca, pc.perfil);
      const situacao = r?.situacao || "SEM_DADO";
      situacoes[situacao] = (situacoes[situacao] || 0) + 1;
      const certificados = situacao === "R_DEFINIDO"
        ? (r.usadas || []).map((u) => ({
            indiceR: u.rastreio || null, certificado: u.certificado || null,
            corrida: u.corrida || null, fornecedor: u.fornecedor || null, nf: u.nf || null,
          }))
        : [];
      if (!certificados.length) semCertificado++;
      return {
        marca: pc.marca || "—", material: pc.material || null, perfil: pc.perfil || null,
        qtd: pc.qte || 1, certificados, situacao,
        criterio: r?.criterio || null, semCorrida: !!r?.semCorrida, troca: r?.troca || null,
      };
    });
    // `avulsas: true` = não é conjunto; o PDF não desenha arame nem "1x" nessa faixa
    out.push({ marca: null, descricao: null, qte: null, avulsas: true, posicoes, consumivel: null });
  }

  return { conjuntos: out, totalPosicoes, semCertificado, totalCertificados, situacoes, avulsas: soltas.length, geradoEm: new Date().toISOString() };
}
