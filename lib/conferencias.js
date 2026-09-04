import "server-only";
import { prisma } from "@/lib/prisma";
import { etapaDasMarcas } from "@/lib/portal-obra-consulta";

// ─── CONFERÊNCIAS: A TELA CONTRADIZ A FÁBRICA? ───────────────────────────────────────────────
//
// ⚠⚠ POR QUE ISTO EXISTE. Vitor (05/09/2026), depois de dois números errados no mesmo dia: "como
// vamos fazer para que você não perca mais essa rota, para não passarmos inverdades para os setores
// e para os clientes?". Três degraus já foram dados — uma função só para a pergunta, a regra na
// memória, e o método de conferir na TELA e não na API. Este é o quarto: uma varredura que compara
// o que o portal mostra com o que a fábrica apontou, e ACUSA a diferença sozinha.
//
// ⚠ Conferência NÃO CONSERTA nada. Ela olha e diz. O conserto é código ou é decisão de gente — e
// uma varredura que "arruma" o que não entende é justamente como se fabrica a próxima inverdade.

/**
 * Obra com produção apontada no Syneco e etapa vazia no portal.
 *
 * É o retrato exato do defeito de 05/09/2026: na OP-112 o Syneco tinha 67 marcas cortadas e o
 * modelo 3D mostrava a obra inteira sem etapa, porque quem é apontado no corte é o CROQUI e a
 * leitura só olhava o apontamento próprio do conjunto.
 */
export async function conferirEtapaPortalXSyneco({ limite = 25 } = {}) {
  // As obras que importam: as que têm portal publicado (falam com o cliente) e as que a fábrica
  // tocou nos últimos 90 dias (falam com os setores).
  const [portais, recentes] = await Promise.all([
    prisma.portalCliente.findMany({ where: { status: "PUBLICADO" }, select: { opNumero: true } }),
    prisma.mesOrdem.findMany({
      where: { produzidoUn: { gt: 0 }, dataInicio: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) } },
      select: { obra: true }, distinct: ["obra"], take: 60,
    }),
  ]);

  const numeros = new Set(portais.map((p) => p.opNumero).filter(Boolean));
  for (const r of recentes) {
    const d = String(r.obra || "").match(/\d+/)?.[0];
    if (d) { numeros.add(d.padStart(3, "0")); numeros.add(d); }
  }

  const ops = await prisma.oP.findMany({
    where: { numero: { in: [...numeros] } },
    select: { id: true, numero: true, obra: true },
    take: limite,
  });

  const achados = [];
  for (const op of ops) {
    const pecas = await prisma.pecaConjunto.findMany({
      where: { opId: op.id }, select: { marca: true, tipoPeca: true }, take: 6000,
    });
    if (!pecas.length) continue;
    const marcas = [...new Set(pecas.map((p) => p.marca).filter(Boolean))];

    const apontadas = await prisma.mesOrdem.findMany({
      where: { item: { in: marcas }, produzidoUn: { gt: 0 } },
      select: { item: true }, distinct: ["item"],
    });
    if (!apontadas.length) continue; // fábrica não tocou: não há o que contradizer

    const mapa = await etapaDasMarcas(op.id, marcas);
    const conjuntos = pecas.filter((p) => p.tipoPeca === "CONJUNTO" && p.marca);
    const comEtapa = conjuntos.filter((c) => mapa.has(c.marca)).length;

    // ⚠ o alarme é o SILÊNCIO da tela: a fábrica apontou e o portal não mostra etapa em conjunto
    // nenhum. Com conjunto, é o caso da 112; sem conjunto na lista, o que importa é o mapa vazio.
    const vazio = conjuntos.length ? comEtapa === 0 : mapa.size === 0;
    if (!vazio) continue;
    achados.push({
      op: op.numero,
      obra: op.obra || null,
      apontadas: apontadas.length,
      conjuntos: conjuntos.length,
      comEtapa,
      texto: `OP-${op.numero}: a fábrica apontou ${apontadas.length} marca(s), e o portal não mostra etapa em ${conjuntos.length ? `nenhum dos ${conjuntos.length} conjuntos` : "marca nenhuma"}`,
    });
  }
  return achados;
}
