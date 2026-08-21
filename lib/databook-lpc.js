import "server-only";
import { prisma } from "./prisma";
import { rastreioDaOp, rastreioDaPeca } from "./rastreio-peca";
import { consumiveisPorConjunto } from "./consumivel-solda";

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
    prisma.documentoQualidade.count({ where: { categoria: "MATERIAL", ativo: true, opNumero: op } }),
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

  return { conjuntos: out, totalPosicoes, semCertificado, totalCertificados, situacoes, geradoEm: new Date().toISOString() };
}
