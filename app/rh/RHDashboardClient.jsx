"use client";
import { useState, useEffect } from "react";
import {
  Users, Building2, Briefcase, UserPlus, Cake, CalendarDays,
  Loader2, AlertCircle, DollarSign,
} from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

export default function RHDashboardClient() {
  const [data, setData] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/rh/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        setData(d.data);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando dashboard…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
        <AlertCircle size={16} /> {erro}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
          Recursos Humanos
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Visão geral do quadro de funcionários
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard icon={Users} label="Funcionários ativos" value={data.totalAtivos} cor="text-torg-blue" borda="border-torg-blue/20" />
        <KPICard icon={Building2} label="Setores" value={data.totalSetores} cor="text-emerald-700" borda="border-emerald-100" />
        <KPICard icon={Briefcase} label="Cargos" value={data.totalCargos} cor="text-purple-700" borda="border-purple-100" />
        <KPICard icon={CalendarDays} label="Em férias" value={data.totalFerias} cor="text-amber-700" borda="border-amber-100" />
        <KPICard icon={AlertCircle} label="Afastados" value={data.totalAfastados} cor="text-red-600" borda="border-red-100" />
        <KPICard icon={DollarSign} label="Folha mensal" value={fmtMoeda(data.custoTotal)} cor="text-torg-dark" borda="border-gray-100" small />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funcionários por Setor */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-torg-dark mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-torg-blue" /> Funcionários por Setor
          </h3>
          {data.funcionariosPorSetor.length === 0 ? (
            <p className="text-sm text-torg-gray">Nenhum setor cadastrado</p>
          ) : (
            <div className="space-y-3">
              {data.funcionariosPorSetor.map((s) => {
                const pct = data.totalAtivos > 0 ? (s.count / data.totalAtivos) * 100 : 0;
                return (
                  <div key={s.setorId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-torg-dark">{s.nome}</span>
                      <span className="text-torg-gray text-xs">{s.count} pessoa{s.count !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-torg-blue rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Admissões Recentes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-torg-dark mb-4 flex items-center gap-2">
            <UserPlus size={16} className="text-torg-blue" /> Admissões Recentes (30 dias)
          </h3>
          {data.admissoesRecentes.length === 0 ? (
            <p className="text-sm text-torg-gray">Nenhuma admissão recente</p>
          ) : (
            <div className="space-y-2">
              {data.admissoesRecentes.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-torg-dark">{f.nome}</span>
                    <span className="text-[10px] text-torg-gray ml-2">{f.cargo?.nome} · {f.setor?.nome}</span>
                  </div>
                  <span className="text-xs text-torg-gray">{fmtData(f.dataAdmissao)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Aniversariantes do Mês */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-torg-dark mb-4 flex items-center gap-2">
            <Cake size={16} className="text-rose-500" /> Aniversariantes do Mês
          </h3>
          {data.aniversariantes.length === 0 ? (
            <p className="text-sm text-torg-gray">Nenhum aniversariante este mês</p>
          ) : (
            <div className="space-y-2">
              {data.aniversariantes.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium text-torg-dark">{f.nome}</span>
                  <span className="text-xs text-torg-gray">{fmtData(f.dataNascimento)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Estado vazio geral */}
      {data.totalFuncionarios === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum funcionário cadastrado ainda</p>
          <p className="text-xs text-torg-gray mt-2">
            Comece cadastrando os <strong>Setores</strong> e <strong>Cargos</strong>, depois adicione os funcionários.
          </p>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, cor, borda, small }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${borda} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={cor} />
        <p className="text-[10px] text-torg-gray uppercase tracking-wide">{label}</p>
      </div>
      <p className={`${small ? "text-lg" : "text-2xl"} font-extrabold ${cor} tabular-nums mt-1 leading-tight`}>
        {value}
      </p>
    </div>
  );
}
