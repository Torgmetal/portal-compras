import "server-only";
import { CAMPO } from "@/lib/gantt-pcp";

// ─── O QUE O PCP PROGRAMOU PARA ESTE RECURSO ──────────────────────────────────
//
// Matheus (10/09/2026): "tem o Gantt que o Vitor fez para programar produção da fábrica, nele
// podemos usar para liberar as marcas em cada máquina/bancada".
//
// ⚠⚠ ISTO É O QUE O NOSSO MES FAZ E O SYNECO NÃO PODE FAZER. O totem do Syneco PERGUNTA ao operador
// qual marca ele vai produzir — ele tem que saber, digitar, e o sistema aceita o que vier. O nosso
// já sabe: o Gantt grava dia e recurso na própria peça, e é só ler. A tela mostra o trabalho em vez
// de cobrar que o operador o conheça de cor.
//
// ⚠ NÃO EXISTE PROGRAMAÇÃO NOVA AQUI. Os campos são os mesmos que o Gantt escreve
// (`lib/gantt-pcp.js`, `CAMPO`). Criar um modelo próprio de "programação do totem" faria o portal
// ter duas verdades sobre o mesmo dia — o erro que `lib/baixa-syneco.js` documenta ter custado caro.

/**
 * Setor do MES → os campos que o Gantt usa.
 *
 * ⚠ PREPARACAO aponta para CAMPO.CORTE: o setor foi renomeado (Matheus, 10/09/2026), mas as colunas
 * de `PecaConjunto` continuam `corteDiaProgramado`/`maquina`. Renomear coluna de 21.772 linhas para
 * acompanhar um rótulo de tela seria trocar risco real por estética.
 */
const CAMPO_DO_SETOR = {
  PREPARACAO: CAMPO.CORTE,
  MONTAGEM: CAMPO.MONTAGEM,
  SOLDA: CAMPO.SOLDA,
  ACABAMENTO: CAMPO.ACABAMENTO,
  JATO: CAMPO.JATO,
  PINTURA: CAMPO.PINTURA,
};

const fimDoDia = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

const SELECAO = {
  id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, perfil: true,
  opNumero: true, opId: true,
};

/**
 * As marcas programadas para este recurso até o fim do dia.
 *
 * ⚠⚠ `lte`, NÃO `equals` — atrasado continua na fila. Se a peça foi programada para ontem e não
 * saiu, ela não deixou de ser trabalho: some da tela e o operador vai perguntar por que o portal
 * "esqueceu". Programado para depois de hoje fica de fora, senão o totem vira lista de desejos.
 *
 * ⚠ A COBERTURA DO GANTT É FINA (246 peças com bancada de montagem, 168 de solda, de 21.772). Ele
 * programa o horizonte próximo, não o backlog — por isso a tela PRECISA do caminho alternativo de
 * bipar livre. Recurso sem programação hoje é o caso comum, não a exceção.
 *
 * @param {{codigo:string, setor:{codigo:string}}} recurso
 */
export async function programadoPara(prisma, recurso, dia = new Date()) {
  const campos = CAMPO_DO_SETOR[recurso?.setor?.codigo];
  if (!campos) return { lotes: [], semMapa: true };

  const pecas = await prisma.pecaConjunto.findMany({
    where: { [campos.recurso]: recurso.codigo, [campos.dia]: { not: null, lte: fimDoDia(dia) } },
    select: { ...SELECAO, [campos.dia]: true },
    orderBy: [{ [campos.dia]: "asc" }, { marca: "asc" }],
  });

  return { lotes: agruparPorObra(pecas, campos.dia), semMapa: false };
}

/** A fábrica enxerga por obra ("a 102 na montagem 1 hoje"), então a tela agrupa igual. */
function agruparPorObra(pecas, campoDia) {
  const porObra = new Map();
  for (const p of pecas) {
    const chave = p.opNumero || "—";
    if (!porObra.has(chave)) porObra.set(chave, { opNumero: chave, opId: p.opId, marcas: [], pecas: 0, kg: 0 });
    const lote = porObra.get(chave);
    lote.marcas.push({
      id: p.id, marca: p.marca, descricao: p.descricao || p.perfil || "",
      qte: p.qte || 0, kg: p.pesoTotalKg || 0, dia: p[campoDia],
    });
    lote.pecas += p.qte || 0;
    lote.kg += p.pesoTotalKg || 0;
  }
  return [...porObra.values()];
}

/**
 * O caminho de quando não há programação: o operador bipa a marca.
 *
 * ⚠⚠ BIPAR NÃO É CAMPO LIVRE. A marca é procurada em `PecaConjunto` e só existe o que está lá — o
 * totem não deixa nascer apontamento contra uma marca que a obra não tem. É a mesma regra da
 * Conferência de Peça ("não está na Lista de Expedição"), e a razão é a mesma: dado digitado errado
 * no pátio vira relatório errado no escritório, semanas depois.
 *
 * ⚠ Ordena por exatidão — marca exata, depois as que começam com o texto. Bipar `T102A1` põe
 * T102A1 na frente sem sumir com T102A15, que é o que quem está no meio da digitação vai escolher.
 */
export async function acharMarca(prisma, termo, limite = 12) {
  const texto = String(termo ?? "").trim().toUpperCase();
  if (texto.length < 2) return [];

  const achadas = await prisma.pecaConjunto.findMany({
    where: { marca: { contains: texto, mode: "insensitive" } },
    select: SELECAO,
    take: 60,
  });

  const nota = (m) => (m === texto ? 0 : m.startsWith(texto) ? 1 : 2);
  return achadas
    .sort((a, b) => nota(a.marca.toUpperCase()) - nota(b.marca.toUpperCase()) || a.marca.localeCompare(b.marca))
    .slice(0, limite)
    .map((p) => ({
      id: p.id, marca: p.marca, descricao: p.descricao || p.perfil || "",
      qte: p.qte || 0, kg: p.pesoTotalKg || 0, opNumero: p.opNumero, opId: p.opId,
    }));
}
