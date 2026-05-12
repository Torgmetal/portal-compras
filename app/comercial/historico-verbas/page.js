// Histórico de alterações de verba — quem mudou, quando, item, valor antes/depois,
// justificativa. Le do AuditLog com filter nas actions de verba.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { History, ArrowRight, Filter } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) =>
  new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const ACTION_LABELS = {
  alterar_verba: { label: "Alterado direto", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  solicitar_verba: { label: "Solicitação", className: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovar_verba: { label: "Aprovado", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejeitar_verba: { label: "Rejeitado", className: "bg-red-50 text-red-700 border-red-200" },
};

export default async function HistoricoVerbasPage({ searchParams }) {
  await requireRole(["ADMIN", "COMERCIAL"]);

  const filtroAcao = searchParams?.acao || "";
  const filtroEmail = searchParams?.email || "";

  const where = {
    action: { in: ["alterar_verba", "solicitar_verba", "aprovar_verba", "rejeitar_verba"] },
  };
  if (filtroAcao) where.action = filtroAcao;
  if (filtroEmail) where.user = { email: { contains: filtroEmail, mode: "insensitive" } };

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { email: true, name: true } } },
  });

  // Enriquece com info do item (OPItem ou AditivoItem) — busca em lote
  const opItemIds = logs.filter((l) => l.entity === "OPItem").map((l) => l.entityId);
  const aditivoItemIds = logs.filter((l) => l.entity === "AditivoItem").map((l) => l.entityId);

  const [opItens, aditivoItens] = await Promise.all([
    opItemIds.length > 0
      ? prisma.oPItem.findMany({
          where: { id: { in: opItemIds } },
          select: {
            id: true, descricao: true, categoria: true,
            op: { select: { id: true, numero: true, cliente: true } },
          },
        })
      : Promise.resolve([]),
    aditivoItemIds.length > 0
      ? prisma.aditivoItem.findMany({
          where: { id: { in: aditivoItemIds } },
          select: {
            id: true, descricao: true, categoria: true,
            aditivo: {
              select: {
                numero: true,
                op: { select: { id: true, numero: true, cliente: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const opItemById = new Map(opItens.map((it) => [it.id, it]));
  const aditivoItemById = new Map(aditivoItens.map((it) => [it.id, it]));

  // Soma agregada de movimentações
  let totalAumentos = 0;
  let totalReducoes = 0;
  for (const l of logs) {
    const diff = (l.diff?.para || 0) - (l.diff?.de || 0);
    if (diff > 0) totalAumentos += diff;
    else if (diff < 0) totalReducoes += Math.abs(diff);
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
          <History size={26} className="text-torg-blue" /> Histórico de verbas
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Registro de todas as alterações, solicitações e decisões de verba dos itens das OPs e aditivos.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4">
          <p className="text-xs text-torg-gray">Total de movimentações</p>
          <p className="text-2xl font-extrabold text-torg-dark tabular-nums">{logs.length}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">últimas 300</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-4">
          <p className="text-xs text-torg-gray">Soma de aumentos</p>
          <p className="text-2xl font-extrabold text-emerald-700 tabular-nums">+ {fmtMoeda(totalAumentos)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-4">
          <p className="text-xs text-torg-gray">Soma de reduções</p>
          <p className="text-2xl font-extrabold text-red-700 tabular-nums">− {fmtMoeda(totalReducoes)}</p>
        </div>
      </div>

      {/* Filtros */}
      <form className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-torg-gray mb-1">Tipo de ação</label>
          <select
            name="acao"
            defaultValue={filtroAcao}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          >
            <option value="">Todas</option>
            <option value="alterar_verba">Alterado direto</option>
            <option value="solicitar_verba">Solicitação</option>
            <option value="aprovar_verba">Aprovado</option>
            <option value="rejeitar_verba">Rejeitado</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-torg-gray mb-1">Email do usuário</label>
          <input
            name="email"
            type="text"
            defaultValue={filtroEmail}
            placeholder="ex: matheus.lima"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1.5"
        >
          <Filter size={14} /> Filtrar
        </button>
        {(filtroAcao || filtroEmail) && (
          <Link
            href="/comercial/historico-verbas"
            className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Limpar
          </Link>
        )}
      </form>

      {/* Tabela */}
      {logs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <History size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhuma alteração encontrada</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ação</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OP / Item</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor antes</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor depois</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((l) => {
                  const acao = ACTION_LABELS[l.action] || { label: l.action, className: "bg-gray-100 text-gray-700 border-gray-200" };
                  const de = l.diff?.de ?? null;
                  const para = l.diff?.para ?? null;
                  const diff = de != null && para != null ? para - de : null;
                  let itemInfo = null;
                  if (l.entity === "OPItem") {
                    const it = opItemById.get(l.entityId);
                    if (it) {
                      itemInfo = {
                        opNumero: it.op?.numero,
                        opId: it.op?.id,
                        cliente: it.op?.cliente,
                        descricao: it.descricao,
                        categoria: it.categoria,
                        tipo: "OP",
                      };
                    }
                  } else if (l.entity === "AditivoItem") {
                    const it = aditivoItemById.get(l.entityId);
                    if (it) {
                      itemInfo = {
                        opNumero: it.aditivo?.op?.numero,
                        opId: it.aditivo?.op?.id,
                        cliente: it.aditivo?.op?.cliente,
                        descricao: it.descricao,
                        categoria: it.categoria,
                        tipo: `Aditivo ${it.aditivo?.numero}`,
                      };
                    }
                  }
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-torg-gray whitespace-nowrap text-xs">{fmtData(l.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <p className="text-torg-dark font-medium truncate max-w-[180px]" title={l.user?.email}>
                          {l.user?.name || "—"}
                        </p>
                        <p className="text-[10px] text-torg-gray truncate max-w-[180px]">{l.user?.email}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${acao.className}`}>
                          {acao.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {itemInfo ? (
                          <div>
                            <div className="flex items-center gap-2 text-xs text-torg-gray">
                              {itemInfo.opId ? (
                                <Link href={`/comercial/${itemInfo.opId}`} className="font-mono text-torg-blue hover:underline">
                                  {itemInfo.opNumero}
                                </Link>
                              ) : (
                                <span className="font-mono">{itemInfo.opNumero || "—"}</span>
                              )}
                              <span>·</span>
                              <span>{itemInfo.tipo}</span>
                              {itemInfo.categoria && (<><span>·</span><span>{itemInfo.categoria}</span></>)}
                            </div>
                            <p className="text-torg-dark font-medium truncate max-w-[280px]" title={itemInfo.descricao}>
                              {itemInfo.descricao}
                            </p>
                          </div>
                        ) : (
                          <span className="text-torg-gray text-xs italic">item removido</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-torg-gray tabular-nums whitespace-nowrap">{fmtMoeda(de)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-300"><ArrowRight size={14} /></td>
                      <td className="px-4 py-2.5 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap">{fmtMoeda(para)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {diff != null && (
                          <span className={diff > 0 ? "text-emerald-700 font-semibold" : diff < 0 ? "text-red-700 font-semibold" : "text-torg-gray"}>
                            {diff > 0 ? "+" : ""}{fmtMoeda(diff)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Linha de justificativas — uma seção compacta */}
      {logs.some((l) => l.diff?.justificativa) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-torg-dark mb-3">Justificativas (últimas {Math.min(logs.length, 20)})</h3>
          <ul className="space-y-2">
            {logs
              .filter((l) => l.diff?.justificativa)
              .slice(0, 20)
              .map((l) => (
                <li key={l.id + "-just"} className="text-xs flex items-start gap-2 border-l-2 border-torg-blue-100 pl-3 py-1">
                  <span className="text-torg-gray whitespace-nowrap">{fmtData(l.createdAt)}</span>
                  <span className="text-torg-dark font-medium">{l.user?.name}:</span>
                  <span className="text-torg-gray flex-1">{l.diff.justificativa}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
