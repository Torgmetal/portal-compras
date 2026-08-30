import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ListaOPsClient from "./ListaOPsClient";


const STATUS_OP = {
  ABERTA:      { label: "Aberta",       className: "bg-torg-blue-50 text-torg-blue" },
  EM_EXECUCAO: { label: "Em execução",  className: "bg-torg-orange-50 text-torg-orange-700" },
  ENCERRADA:   { label: "Encerrada",    className: "bg-gray-100 text-gray-600" },
  ATRASADA:    { label: "Atrasada",     className: "bg-red-50 text-red-700" },
  CANCELADA:   { label: "Cancelada",    className: "bg-gray-100 text-gray-500" },
};

function calcStatus(op) {
  if (op.status === "CANCELADA") return "CANCELADA";
  if (op.status === "ENCERRADA" || op.dataFimReal) return "ENCERRADA";
  if (op.dataFimPrevista && new Date(op.dataFimPrevista) < new Date()) return "ATRASADA";
  if (op.dataInicio && new Date(op.dataInicio) <= new Date()) return "EM_EXECUCAO";
  return "ABERTA";
}


export default async function PainelOPs() {
  await requireRole(["ADMIN", "COMPRAS"]);

  const opsRaw = await prisma.oP.findMany({
    include: {
      itens: { select: { valorVerba: true } },
      aditivos: { include: { itens: { select: { valorVerba: true } } } },
      rms: {
        select: {
          id: true, numero: true, status: true,
          itens: { select: { status: true } },
          cotacoes: { select: { status: true } },
        },
      },
    },
  });
  // Ordena numericamente pelo numero, do MAIOR para o menor (OPs mais recentes no topo)
  const ops = opsRaw.sort((a, b) =>
    (b.numero || "").localeCompare(a.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  const opsComStats = ops.map((op) => {
    const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
    const verbaAditivos = op.aditivos.reduce(
      (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0),
      0
    );

    const totalRMs = op.rms.length;
    const totalCotacoesEnviadas = op.rms.reduce((s, r) => s + r.cotacoes.length, 0);
    const totalCotacoesRecebidas = op.rms.reduce(
      (s, r) => s + r.cotacoes.filter((c) => c.status === "RECEBIDA").length,
      0
    );
    const itensPedido = op.rms.reduce(
      (s, r) => s + r.itens.filter((i) => i.status === "PEDIDO_GERADO").length,
      0
    );
    const itensTotais = op.rms.reduce((s, r) => s + r.itens.length, 0);

    return {
      ...op,
      verbaTotal: verbaBase + verbaAditivos,
      statusCalc: calcStatus(op),
      stats: {
        rms: totalRMs,
        cotacoesEnviadas: totalCotacoesEnviadas,
        cotacoesRecebidas: totalCotacoesRecebidas,
        itensPedido,
        itensTotais,
      },
    };
  });

  // ⚠ o filtro fica: `totalAtivas` (o contador da aba) ainda depende dele. O que saiu foi só o
  // `reduce` que somava RMs, cotações e itens para os cartões que o Vitor pediu para tirar.
  const opsAtivasParaKpis = opsComStats.filter(
    (op) => op.statusCalc !== "ENCERRADA" && op.statusCalc !== "CANCELADA"
  );

  // ⚠ SÓ OBRA EM ANDAMENTO. Vitor (30/08/2026): "OPs finalizadas pode tirar dessa lista, aqui só
  // fica obras em andamento". A aba de finalizadas saiu junto — histórico de obra encerrada não é
  // trabalho de Compras, e ela só empurrava para baixo o que precisa de atenção.
  const opsFiltradas = opsAtivasParaKpis;

  const totalAtivas = opsAtivasParaKpis.length;
  const totalFinalizadas = opsComStats.length - totalAtivas;

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Painel de OPs</h2>
        <p className="text-sm text-torg-gray mt-1">
          Obras em andamento — cada OP traz suas RMs, cotações e pedidos. Clique pra abrir o mapa de cotação.
        </p>
      </div>

      <ListaOPsClient
        ops={opsFiltradas.map((op) => ({
          id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra,
          dataFimPrevista: op.dataFimPrevista ? op.dataFimPrevista.toISOString() : null,
          statusCalc: op.statusCalc, stats: op.stats,
        }))}
        statusCfg={STATUS_OP}
      />
    </div>
  );
}
