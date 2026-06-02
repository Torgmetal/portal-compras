import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString, parseSemana, semanaInicio, semanaFim, fmtSemana } from "@/lib/semana";
import { ExternalLink, FileText, Package } from "lucide-react";
import RomaneiosSharepoint from "@/components/RomaneiosSharepoint";
import { fmtOP } from "@/lib/utils";


export const metadata = {
  title: "Workspace Torg — Romaneios (Produção)",
};

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function RomaneiosProducao() {
  await requireRole(["ADMIN", "PRODUCAO", "EXPEDICAO", "COMERCIAL"]);

  // Janela: 12 semanas pra trás
  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setDate(inicioJanela.getDate() - 12 * 7);

  const [romaneios, producoes, opsRaw] = await Promise.all([
    prisma.romaneio.findMany({
      where: { data: { gte: inicioJanela } },
      orderBy: { data: "desc" },
      include: { op: { select: { numero: true, cliente: true } } },
    }),
    prisma.producaoSemanal.findMany({
      where: { dataInicio: { gte: inicioJanela } },
      orderBy: { dataInicio: "asc" },
    }),
    prisma.oP.findMany({
      where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: { id: true, numero: true, cliente: true, obra: true },
    }),
  ]);
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  // Agrega: peso previsto/realizado e romaneios por semana
  const semanas = {};
  for (const r of romaneios) {
    const sem = isoWeekString(new Date(r.data));
    if (!semanas[sem]) semanas[sem] = { semana: sem, prevKg: 0, realKg: 0, romKg: 0, romValor: 0, romCount: 0 };
    semanas[sem].romKg += r.pesoRealKg || 0;
    semanas[sem].romValor += r.valorTotal || 0;
    semanas[sem].romCount += 1;
  }
  for (const p of producoes) {
    const sem = p.semana;
    if (!semanas[sem]) semanas[sem] = { semana: sem, prevKg: 0, realKg: 0, romKg: 0, romValor: 0, romCount: 0 };
    semanas[sem].prevKg += p.pesoPrevistoKg || 0;
    semanas[sem].realKg += p.pesoRealizadoKg || 0;
  }
  const semanasArr = Object.values(semanas).sort((a, b) => (a.semana < b.semana ? 1 : -1));
  const semanaAtual = isoWeekString(hoje);

  // Totais
  const totais = romaneios.reduce(
    (acc, r) => {
      acc.qtd += 1;
      acc.kg += r.pesoRealKg || 0;
      acc.valor += r.valorTotal || 0;
      return acc;
    },
    { qtd: 0, kg: 0, valor: 0 }
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Romaneios (Produção)
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Visão da Produção pra validar peso real expedido vs previsto. Cadastro feito pela Expedição.
          </p>
        </div>
        <Link
          href="/expedicao"
          className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
        >
          <ExternalLink size={16} /> Cadastrar romaneio
        </Link>
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
          <div className="bg-torg-blue p-2.5 rounded-lg"><FileText size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Romaneios (12 semanas)</p>
            <p className="text-xl font-extrabold text-torg-dark tabular-nums">{totais.qtd}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
          <div className="bg-torg-blue-700 p-2.5 rounded-lg"><Package size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Peso expedido total</p>
            <p className="text-xl font-extrabold text-torg-dark tabular-nums">{fmtKg(totais.kg)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
          <div className="bg-torg-orange p-2.5 rounded-lg"><Package size={20} className="text-white" /></div>
          <div>
            <p className="text-xs text-torg-gray">Valor expedido total</p>
            <p className="text-xl font-extrabold text-torg-dark tabular-nums">{fmtMoeda(totais.valor)}</p>
          </div>
        </div>
      </div>

      {/* Validação semanal: previsto x realizado x romaneio */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Validação semanal</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Compare o que o PCP planejou × o que produziu × o que de fato saiu via romaneio.
          </p>
        </div>
        {semanasArr.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Sem dados nas últimas 12 semanas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Semana</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Previsto PCP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Realizado PCP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso Romaneio</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Δ Romaneio × Previsto</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Romaneios</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {semanasArr.map((s) => {
                  const isAtual = s.semana === semanaAtual;
                  const delta = s.romKg - s.prevKg;
                  const pct = s.prevKg > 0 ? (s.romKg / s.prevKg) * 100 : 0;
                  return (
                    <tr key={s.semana} className={`hover:bg-gray-50 ${isAtual ? "bg-torg-blue-50/30" : ""}`}>
                      <td className="px-4 py-2 font-mono text-xs">
                        <span className={isAtual ? "text-torg-blue font-semibold" : "text-torg-dark"}>{s.semana}</span>
                        {isAtual && <span className="text-[10px] text-torg-blue ml-1">atual</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-torg-gray tabular-nums">{fmtKg(s.prevKg)}</td>
                      <td className="px-4 py-2 text-right text-torg-dark tabular-nums">{fmtKg(s.realKg)}</td>
                      <td className="px-4 py-2 text-right text-torg-blue font-medium tabular-nums">{fmtKg(s.romKg)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium text-xs ${
                        s.prevKg === 0 ? "text-torg-gray" :
                        pct >= 95 ? "text-torg-blue" :
                        pct >= 80 ? "text-torg-orange-700" : "text-red-600"
                      }`}>
                        {s.prevKg === 0 ? "—" : `${pct.toFixed(1)}% (${delta >= 0 ? "+" : ""}${fmtKg(delta)})`}
                      </td>
                      <td className="px-4 py-2 text-right text-torg-gray text-xs">{s.romCount}</td>
                      <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums text-xs">
                        {s.romValor > 0 ? fmtMoeda(s.romValor) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lista detalhada (read-only) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-semibold text-torg-dark">Lista de romaneios</h3>
            <p className="text-xs text-torg-gray mt-0.5">Read-only — edição é feita no Portal de Expedição.</p>
          </div>
          <Link href="/expedicao" className="text-xs text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1 font-medium">
            Abrir Expedição <ExternalLink size={12} />
          </Link>
        </div>
        {romaneios.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Nenhum romaneio nas últimas 12 semanas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">R$/kg</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {romaneios.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-torg-dark text-xs">{r.numero}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{fmtData(r.data)}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.op ? (
                        <>
                          <span className="font-mono text-torg-blue">{fmtOP(r.op.numero)}</span>
                          <span className="text-torg-gray block text-[10px]">{r.op.cliente}</span>
                        </>
                      ) : <span className="text-torg-gray">—</span>}
                    </td>
                    <td className="px-4 py-2 text-torg-dark text-xs max-w-[260px] truncate">{r.descricao || "—"}</td>
                    <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtKg(r.pesoRealKg)}</td>
                    <td className="px-4 py-2 text-right text-torg-gray tabular-nums text-xs">
                      {r.valorPorKg ? fmtMoeda(r.valorPorKg) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-torg-blue font-medium tabular-nums">
                      {r.valorTotal ? fmtMoeda(r.valorTotal) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Romaneios do SharePoint (marcas e pesos) */}
      <div>
        <h3 className="text-lg font-semibold text-torg-dark mb-3">Romaneios SharePoint (por OP)</h3>
        <p className="text-xs text-torg-gray mb-4">
          Selecione uma OP para visualizar os romaneios do SharePoint com marcas e pesos detalhados.
        </p>
        <RomaneiosSharepoint ops={ops} />
      </div>
    </div>
  );
}
