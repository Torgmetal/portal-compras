import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FileText, BarChart3, Truck, ClipboardList } from "lucide-react";
import RMsTabelaSeletor from "../RMsTabelaSeletor";
import { log } from "@/lib/log";
import { buscarRMsDoPainel, agregarCotacoes, normalizarOp, LIMITE_SEM_OBRA } from "@/lib/rms-painel";

const registro = log("compras/consumiveis");



export default async function PainelConsumiveis({ searchParams }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);
  const verArquivadas = searchParams?.arquivadas === "1";

  const opSelecionada = normalizarOp(searchParams?.op);

  const [{ rms, obras, total, truncada }, totais, categoriasCustom] = await Promise.all([
    // ⚠ Mesma consulta das RMs de materiais (`lib/rms-painel.js`): o filtro de obra é do SERVIDOR e
    // as opções saem de consulta própria. Hoje as 34 RMs internas são TODAS sem OP, então o seletor
    // nem aparece — mas o teto de 100 é o mesmo, e o dia em que o histórico passar disso a tela vai
    // dizer que está cortando, em vez de esconder RM como a de materiais escondia 111.
    buscarRMsDoPainel("INTERNA", verArquivadas, opSelecionada),
    prisma.rM.groupBy({ by: ["status"], where: { tipoRM: "INTERNA" }, _count: { _all: true } }),
    prisma.categoriaFornecedor.findMany({
      where: { ativa: true },
      orderBy: [{ ordem: "asc" }, { label: "asc" }],
    }),
  ]);

  await agregarCotacoes(rms, registro, "/compras/consumiveis");

  const statusCount = totais.reduce((acc, t) => {
    acc[t.status] = t._count._all;
    return acc;
  }, {});

  const emCotacao = (statusCount.EM_COTACAO || 0) + (statusCount.COTADA || 0);
  const totalAtivas = (statusCount.ABERTA || 0) + emCotacao;

  const cards = [
    { label: "RMs ativas", value: totalAtivas, color: "bg-torg-blue", Icon: FileText },
    { label: "Abertas", value: statusCount.ABERTA || 0, color: "bg-torg-orange", Icon: ClipboardList },
    { label: "Em cotacao", value: emCotacao, color: "bg-torg-blue-700", Icon: BarChart3 },
    { label: "Pedido gerado", value: statusCount.PEDIDO_GERADO || 0, color: "bg-torg-dark", Icon: Truck },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">RMs — Consumiveis / Servicos</h2>
          <p className="text-sm text-torg-gray mt-1">RMs internas · Almoxarifado e demais setores</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras/consumiveis"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              !verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Ativas
          </Link>
          <Link
            href="/compras/consumiveis?arquivadas=1"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Historico
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
            <div className={`${c.color} p-2.5 rounded-lg`}>
              <c.Icon size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-torg-gray truncate">{c.label}</p>
              <p className="text-xl font-extrabold text-torg-dark tabular-nums">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verArquivadas ? "Nenhuma RM de consumivel no historico" : "Nenhuma RM de consumivel ativa"}
          </p>
          {!verArquivadas && (
            <p className="text-sm text-torg-gray mt-2">
              O Almoxarifado pode criar RMs internas em <strong>/rm/nova</strong> escolhendo o tipo &quot;Interna Torg&quot;.
            </p>
          )}
        </div>
      ) : (
        <RMsTabelaSeletor
          key={`INTERNA-${verArquivadas ? "hist" : "ativas"}-${opSelecionada || "todas"}`}
          rms={JSON.parse(JSON.stringify(rms))}
          isAdmin={user.role === "ADMIN"}
          categoriasCustom={JSON.parse(JSON.stringify(categoriasCustom))}
          verArquivadas={verArquivadas}
          obras={obras}
          opSelecionada={opSelecionada}
          totalNoEscopo={total}
          truncada={truncada}
          limite={LIMITE_SEM_OBRA}
          basePath="/compras/consumiveis"
        />
      )}
    </div>
  );
}
