import "server-only";
import { prisma } from "./prisma";
import { CMR_CAT } from "./cmr";
import { DO_CMR } from "./cmr-origens";
import { ehMaterialDeTinta, litrosDaEmbalagem } from "./material-tinta";
import { consumoDoPlano, camadaUmida, espessuraSeca, diluicaoPct, solidosDaDemao } from "./consumo-tinta-plp";
import { SO_FABRICACAO } from "./lista-pecas";
import { corDaPeca, coresDasPecas } from "./cor-da-peca";

// ─── O CADERNO DE PINTURA DE UMA OP ────────────────────
//
// Vitor (07/09/2026): "todas as folhas sairão da OP selecionada na barra do Gantt de cada OP". Por
// isso este módulo responde por UMA obra e não por um consolidado — o caderno inteiro é dela.
//
// São três folhas, e cada uma responde a uma pergunta diferente:
//   1. QUANTIDADE     quanto tem para pintar e quanta tinta isso consome
//   2. QUAL TINTA     qual R do CMR vai ser gasto, em ordem FEFO
//   3. PARA O PINTOR  o que ele precisa saber com a pistola na mão
//
// ⚠⚠ FEFO, NÃO FIFO. O aço usa a entrega mais antiga; tinta VENCE, e gastar antes o lote que vence
// antes é o certo. Lote sem validade vai para o FIM da fila — "—" não é "vence nunca", é "não
// sabemos", e supor que dura para sempre é o erro caro. Só entradas lançadas a partir de 07/09/2026
// têm validade; as antigas aparecem sem, de propósito.
//
// ⚠ A ÁREA É A DA FILA, não a da obra inteira. O caderno serve para o lote que vai ser pintado
// agora; usar o m² da obra toda mandaria comprar tinta de tudo para pintar um pedaço.

/** Peças da OP que estão esperando pintura (mesma regra da fila do PCP). */
async function pecasDaFila(opNumero, ids) {
  return prisma.pecaConjunto.findMany({
    where: ids?.length ? { id: { in: ids } } : { ...SO_FABRICACAO, op: { numero: opNumero } },
    select: {
      id: true, marca: true, descricao: true, perfil: true, qte: true,
      pesoTotalKg: true, areaPinturaM2: true, tipoPeca: true,
    },
    orderBy: { marca: "asc" },
  });
}

/**
 * Tudo que as três folhas precisam, para uma OP.
 *
 * @param {string} opNumero
 * @param {string[]} [ids] peças do lote; sem elas, a OP inteira
 */
export async function cadernoDePintura(opNumero, ids) {
  const [op, plano, pecas] = await Promise.all([
    prisma.oP.findFirst({ where: { numero: opNumero }, select: { numero: true, obra: true, cliente: true } }),
    prisma.planoPintura.findFirst({ where: { opNumero } }),
    pecasDaFila(opNumero, ids),
  ]);
  if (!op) throw new Error(`OP-${opNumero} não encontrada.`);

  const m2 = pecas.reduce((s, p) => s + (p.areaPinturaM2 || 0), 0);
  const kg = pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0);
  const semArea = pecas.filter((p) => p.areaPinturaM2 == null).length;

  const [produtoTinta, tintaProduto] = await Promise.all([
    prisma.produtoTinta.findMany(),
    prisma.tintaProduto.findMany({ select: { nome: true, svPct: true } }),
  ]);
  const cat = { produtoTinta, tintaProduto };
  const r = plano ? consumoDoPlano(plano, Math.round(m2 * 100) / 100, cat) : null;

  // ⚠ O CMR DA OBRA, SÓ TINTA, EM ORDEM FEFO. Uma linha por R — a tinta vem em TRIO (tinta +
  // endurecedor + diluente), cada um com seu R e seu lote, e os três precisam ser do mesmo
  // conjunto. Medido na OP-112: R261340 lote 89121, R261341 lote 89122, R261342 lote 89123, NF
  // 25645. Amarrar só o R da tinta deixaria dois terços do sistema sem rastreio.
  const cmr = (await prisma.documentoQualidade.findMany({
    where: { categoria: CMR_CAT, ...DO_CMR, opNumero },
    select: { importRef: true, nome: true, numeroCorrida: true, nfNumero: true, fornecedor: true,
              quantidade: true, dataRecebimento: true, dataValidade: true, arquivoUrl: true },
  }))
    .filter((c) => ehMaterialDeTinta(c.nome))
    .sort((a, b) => {
      const va = a.dataValidade ? +a.dataValidade : Infinity;
      const vb = b.dataValidade ? +b.dataValidade : Infinity;
      if (va !== vb) return va - vb;
      return (a.dataRecebimento ? +a.dataRecebimento : Infinity) - (b.dataRecebimento ? +b.dataRecebimento : Infinity);
    })
    .map((c) => ({
      R: c.importRef, produto: c.nome, lote: c.numeroCorrida, nf: c.nfNumero,
      fornecedor: c.fornecedor, qtd: c.quantidade,
      validade: c.dataValidade, recebido: c.dataRecebimento, temCertificado: !!c.arquivoUrl,
      // ⚠ litros só quando a nota diz o tamanho da embalagem; null é "não sabemos", não zero
      litrosEmbalagem: litrosDaEmbalagem(c.nome),
    }));

  const recebido = cmr.reduce((s, c) => s + (c.qtd || 0), 0);
  // ⚠⚠ O RECEBIDO SÓ VIRA LITRO QUANDO A NOTA DIZ O TAMANHO DA EMBALAGEM. Das 486 entradas de tinta
  // do CMR, 112 trazem o tamanho — e ele varia (18 L, 20 L, 16 L). Tratar "33 unidades" como 33
  // galões de 3,6 L quando cada uma é um balde de 18 L erra por cinco vezes, e no sentido perigoso:
  // manda comprar tinta que já está no almoxarifado, ou diz que está tudo certo quando falta.
  const comTamanho = cmr.filter((c) => c.litrosEmbalagem != null);
  const recebidoL = comTamanho.reduce((s, c) => s + c.litrosEmbalagem * (c.qtd || 0), 0);
  const semTamanho = cmr.length - comTamanho.length;
  const demaos = (Array.isArray(plano?.demaos) ? plano.demaos : []).map((d) => {
    const sv = solidosDaDemao(d, cat);
    const u = camadaUmida(d, sv?.sv);
    return {
      ordem: d.ordem ?? null, camada: d.nome || null, produto: d.produto || null,
      fabricante: d.fabricante || null, cor: d.cor || null,
      seca: espessuraSeca(d), sv: sv?.sv ?? null, origemSv: sv?.origem ?? null,
      diluicaoPct: diluicaoPct(d), diluente: d.diluicao || null,
      umida: u.umida, origemUmida: u.origem || null, faltaUmida: u.falta || null,
      componentes: d.componentes || null, potLife: d.potLife || null, secagem: d.secagem || null,
    };
  });

  return {
    op: { numero: op.numero, obra: op.obra, cliente: op.cliente },
    temPlp: !!plano,
    // ⚠ o que impede a conta, por nome — é o que a folha mostra em vez de um zero
    falta: !plano ? ["PLP da obra"] : [...new Set((r?.camadas || []).map((c) => c.falta).filter(Boolean))],
    quantidade: {
      pecas: pecas.length, kg: Math.round(kg), m2: Math.round(m2 * 100) / 100, semArea,
      demaos: demaos.length || null,
      m2Aplicar: Math.round(m2 * (demaos.length || 1) * 100) / 100,
      litros: r?.total.litros ?? null, galoes: r?.total.galoes ?? null,
      diluenteL: r?.total.diluente ?? null,
      // quantas EMBALAGENS chegaram (a unidade que o CMR conta), e quantas delas dizem o tamanho
      recebidoEmbalagens: recebido,
      recebidoL: comTamanho.length ? Math.round(recebidoL * 100) / 100 : null,
      embalagensSemTamanho: semTamanho,
      /* ⚠ A FALTA SÓ É AFIRMÁVEL EM LITROS, e só quando TODA embalagem diz o tamanho. Com uma
         sequer sem tamanho, o total recebido é um piso — dizer "faltam X" a partir de um piso é
         afirmar o que não se sabe. Aí devolve null e a folha explica por quê. */
      faltaL: r?.total.litros != null && semTamanho === 0 && comTamanho.length
        ? Math.round(Math.max(0, r.total.litros - recebidoL) * 100) / 100
        : null,
    },
    camadas: (r?.camadas || []).map((c, i) => ({ ...c, ...demaos[i] })),
    demaos,
    cmr,
    // ⚠ AS CORES SÃO POR ITEM, NÃO POR DEMÃO — na OP-067 o mesmo sistema pinta plataforma de preto
    // e guarda-corpo de amarelo. Ver a nota no modelo PlanoPintura.
    cores: Array.isArray(plano?.itens) ? plano.itens : [],
    // ⚠⚠ A COR VEM DO TIPO DA ESTRUTURA. Vitor (07/09/2026): "você consegue já puxar pelo tipo da
    // estrutura a cor que ela será pintada?". A regra mora em lib/cor-da-peca.js e não chuta: quando
    // a descrição não casa com nenhum tipo do PLP, ou casa com dois, devolve "definir". Peça pintada
    // da cor errada é retrabalho, e o erro só aparece depois de curar.
    pecas: pecas.map((p) => {
      const c = corDaPeca(p.descricao, Array.isArray(plano?.itens) ? plano.itens : []);
      return {
        marca: p.marca, descricao: p.descricao, perfil: p.perfil,
        qte: Math.max(1, p.qte || 1), kg: Math.round(p.pesoTotalKg || 0),
        m2: p.areaPinturaM2 == null ? null : Math.round(p.areaPinturaM2 * 100) / 100,
        cor: c.cor, estrutura: c.estrutura, origemCor: c.origem,
      };
    }),
    // o m² por COR — é o que dimensiona a compra de cada uma, e o que a folha do pintor mostra
    porCor: coresDasPecas(
      pecas.map((p) => ({ descricao: p.descricao, kg: p.pesoTotalKg,
        m2: p.areaPinturaM2 == null ? null : p.areaPinturaM2 })),
      Array.isArray(plano?.itens) ? plano.itens : [],
    ),
  };
}
