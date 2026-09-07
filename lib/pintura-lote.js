import "server-only";
import { prisma } from "./prisma";
import { CMR_CAT } from "./cmr";
import { DO_CMR } from "./cmr-origens";
import { ehMaterialDeTinta } from "./material-tinta";
import { consumoDoPlano, camadaUmida, espessuraSeca, diluicaoPct, solidosDaDemao } from "./consumo-tinta-plp";
import { SO_FABRICACAO } from "./lista-pecas";

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
    }));

  const recebido = cmr.reduce((s, c) => s + (c.qtd || 0), 0);
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
      recebidoGaloes: recebido,
      // ⚠ o aviso de falta só existe quando a conta fecha; sem SV não dá para dizer que falta
      faltaGaloes: r?.total.galoes != null ? Math.max(0, r.total.galoes - recebido) : null,
    },
    camadas: (r?.camadas || []).map((c, i) => ({ ...c, ...demaos[i] })),
    demaos,
    cmr,
    // ⚠ AS CORES SÃO POR ITEM, NÃO POR DEMÃO — na OP-067 o mesmo sistema pinta plataforma de preto
    // e guarda-corpo de amarelo. Ver a nota no modelo PlanoPintura.
    cores: Array.isArray(plano?.itens) ? plano.itens : [],
    pecas: pecas.map((p) => ({
      marca: p.marca, descricao: p.descricao, perfil: p.perfil,
      qte: Math.max(1, p.qte || 1), kg: Math.round(p.pesoTotalKg || 0),
      m2: p.areaPinturaM2 == null ? null : Math.round(p.areaPinturaM2 * 100) / 100,
    })),
  };
}
