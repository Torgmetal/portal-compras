"use client";
import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import {
  Receipt, Loader2, AlertCircle, RefreshCw, Inbox, LogOut, FileText, CheckCircle2,
  CalendarDays, Palmtree, KeyRound,
} from "lucide-react";
import Link from "next/link";

const TIPO_LABEL = { MENSAL: "Mensal", DECIMO_TERCEIRO: "13º salário", FERIAS: "Férias", RESCISAO: "Rescisão" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEM = ["D", "S", "T", "Q", "Q", "S", "S"];
const STATUS_F = {
  PROGRAMADA: { label: "Programada", cor: "bg-blue-100 text-blue-700" },
  GOZADA: { label: "Gozada", cor: "bg-green-100 text-green-700" },
  PENDENTE: { label: "Pendente", cor: "bg-amber-100 text-amber-700" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtMoeda = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function competenciaExtenso(c) {
  if (!c) return "";
  const [ano, mes] = c.split("-");
  return `${MESES[Number(mes) - 1] || mes} de ${ano}`;
}

// UTC day-only timestamp (evita deslocamento de fuso)
const diaUTC = (s) => {
  const d = new Date(s);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

function mesesEntre(inicioStr, fimStr) {
  const di = new Date(inicioStr), df = new Date(fimStr);
  const res = [];
  let y = di.getUTCFullYear(), m = di.getUTCMonth();
  const yf = df.getUTCFullYear(), mf = df.getUTCMonth();
  while ((y < yf || (y === yf && m <= mf)) && res.length < 4) {
    res.push({ ano: y, mes: m });
    m++; if (m > 11) { m = 0; y++; }
  }
  return res;
}

function MesCalendario({ ano, mes, inicio, fim }) {
  const iniU = diaUTC(inicio), fimU = diaUTC(fim);
  const primeiroDiaSem = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const celulas = [];
  for (let i = 0; i < primeiroDiaSem; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 w-full max-w-[240px]">
      <div className="text-center text-sm font-semibold text-torg-dark mb-2">{MESES[mes]} {ano}</div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEM.map((d, i) => <div key={`h${i}`} className="text-[10px] text-torg-gray font-medium">{d}</div>)}
        {celulas.map((d, i) => {
          if (d == null) return <div key={i} />;
          const dentro = Date.UTC(ano, mes, d) >= iniU && Date.UTC(ano, mes, d) <= fimU;
          return (
            <div key={i} className={`text-xs py-1.5 rounded-md ${dentro ? "bg-torg-blue text-white font-bold" : "text-torg-dark"}`}>{d}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function MeuRHClient({ nome }) {
  const [aba, setAba] = useState("holerites");

  // Holerites
  const [holerites, setHolerites] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(null);

  // Férias
  const [ferias, setFerias] = useState([]);
  const [periodoFerias, setPeriodoFerias] = useState(null);
  const [carregandoFerias, setCarregandoFerias] = useState(true);
  const [erroFerias, setErroFerias] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/meu-rh/holerite");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setHolerites(d.holerites || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarFerias = useCallback(async () => {
    setCarregandoFerias(true); setErroFerias("");
    try {
      const r = await fetch("/api/meu-rh/ferias");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setFerias(d.ferias || []);
      setPeriodoFerias(d.periodo || null);
    } catch (e) {
      setErroFerias(e.message);
    } finally {
      setCarregandoFerias(false);
    }
  }, []);

  useEffect(() => { carregar(); carregarFerias(); }, [carregar, carregarFerias]);

  const abrir = (id) => {
    window.open(`/api/meu-rh/holerite/${id}/arquivo`, "_blank", "noopener");
    setTimeout(carregar, 1500);
  };

  const confirmar = async (id) => {
    setConfirmando(id);
    try {
      const r = await fetch(`/api/meu-rh/holerite/${id}/confirmar`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao confirmar");
      setHolerites((prev) => prev.map((h) => (h.id === id ? { ...h, status: "CONFIRMADO", confirmadoEm: d.confirmadoEm || new Date().toISOString() } : h)));
    } catch (e) {
      setErro(e.message);
    } finally {
      setConfirmando(null);
    }
  };

  // Próxima férias = a mais cedo que ainda não terminou; senão a última registrada.
  const hoje = Date.now();
  const proxima = ferias.find((f) => diaUTC(f.dataFim) >= hoje) || ferias[ferias.length - 1] || null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-torg-blue flex items-center justify-center text-white"><Receipt size={20} /></div>
          <div>
            <h1 className="text-xl font-extrabold text-torg-dark leading-tight">Meu RH</h1>
            <p className="text-sm text-torg-gray">Olá, {nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/meu-rh/trocar-senha" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5"><KeyRound size={16} /> Trocar senha</Link>
          <button onClick={() => signOut({ callbackUrl: "/entrar" })}
            className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5"><LogOut size={16} /> Sair</button>
        </div>
      </header>

      {/* Abas */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setAba("holerites")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "holerites" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Receipt size={15} /> Holerites
        </button>
        <button onClick={() => setAba("ferias")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "ferias" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Palmtree size={15} /> Férias
        </button>
      </div>

      {aba === "holerites" && (
        carregando ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
        ) : erro ? (
          <div className="py-16 text-center">
            <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erro}</p>
            <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : holerites.length === 0 ? (
          <div className="py-16 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">Você ainda não tem holerites disponíveis.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {holerites.map((h) => {
              const confirmado = h.status === "CONFIRMADO";
              return (
                <div key={h.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="font-semibold text-torg-dark">{competenciaExtenso(h.competencia)}</div>
                    <div className="text-xs text-torg-gray mt-0.5">
                      {TIPO_LABEL[h.tipo] || h.tipo}{h.empresa ? ` · ${h.empresa}` : ""}
                      {confirmado && h.confirmadoEm ? ` · confirmado em ${new Date(h.confirmadoEm).toLocaleDateString("pt-BR")}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrir(h.id)}
                      className="px-3 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2">
                      <FileText size={15} /> Ver holerite
                    </button>
                    {confirmado ? (
                      <span className="px-3 py-2 text-sm text-green-700 bg-green-50 rounded-lg font-medium flex items-center gap-2"><CheckCircle2 size={15} /> Recebido</span>
                    ) : (
                      <button onClick={() => confirmar(h.id)} disabled={confirmando === h.id}
                        className="px-3 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium flex items-center gap-2 disabled:opacity-50">
                        {confirmando === h.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Recebi e confirmo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {aba === "ferias" && (
        carregandoFerias ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
        ) : erroFerias ? (
          <div className="py-16 text-center">
            <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erroFerias}</p>
            <button onClick={carregarFerias} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Próximas férias em destaque, com calendário e valor */}
            {proxima ? (
              <div className="bg-gradient-to-br from-torg-blue to-torg-blue-700 rounded-2xl p-5 text-white shadow-sm">
                <div className="flex items-center gap-2 text-white/90 text-sm font-medium mb-1">
                  <CalendarDays size={16} /> {diaUTC(proxima.dataFim) >= hoje ? "Suas próximas férias" : "Últimas férias"}
                </div>
                <div className="text-2xl font-extrabold tracking-tight">
                  {fmtData(proxima.dataInicio)} <span className="text-white/70 font-normal">→</span> {fmtData(proxima.dataFim)}
                </div>
                <div className="text-sm text-white/85 mt-1">
                  {proxima.diasGozo} dias de gozo{proxima.diasVendidos ? ` · ${proxima.diasVendidos} dias vendidos (abono)` : ""}
                </div>
                <div className="mt-4 flex flex-col sm:flex-row gap-4 items-start">
                  <div className="flex flex-wrap gap-3">
                    {mesesEntre(proxima.dataInicio, proxima.dataFim).map((m) => (
                      <div key={`${m.ano}-${m.mes}`} className="text-torg-dark">
                        <MesCalendario ano={m.ano} mes={m.mes} inicio={proxima.dataInicio} fim={proxima.dataFim} />
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/15 rounded-xl px-4 py-3 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-wide text-white/80">Valor estimado a receber</p>
                    <p className="text-2xl font-extrabold">{fmtMoeda(proxima.valorEstimado)}</p>
                    <p className="text-[11px] text-white/70 mt-1">Estimativa — o valor final é o da folha.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center bg-white rounded-2xl border border-gray-100">
                <Palmtree size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-torg-gray">Você ainda não tem férias programadas.</p>
                <p className="text-sm text-torg-gray mt-1">Quando o RH programar, elas aparecem aqui com as datas e o valor.</p>
              </div>
            )}

            {/* Situação do período aquisitivo */}
            {periodoFerias && (
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-sm text-torg-gray">
                Período aquisitivo atual: <span className="font-medium text-torg-dark">{fmtData(periodoFerias.aquisInicio)} → {fmtData(periodoFerias.aquisFim)}</span>
                {periodoFerias.situacao === "A_GOZAR" && <span className="ml-1">— você já tem direito a férias.</span>}
                {periodoFerias.situacao === "EM_AQUISICAO" && <span className="ml-1">— ainda em aquisição.</span>}
                {periodoFerias.situacao === "VENCIDA" && <span className="ml-1 text-red-600 font-medium">— férias vencidas, procure o RH.</span>}
              </div>
            )}

            {/* Histórico / lista */}
            {ferias.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-torg-dark mb-2">Todas as suas férias</h3>
                <div className="space-y-2">
                  {ferias.map((f) => {
                    const st = STATUS_F[f.status] || { label: f.status, cor: "bg-gray-100 text-gray-600" };
                    return (
                      <div key={f.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-semibold text-torg-dark">{fmtData(f.dataInicio)} → {fmtData(f.dataFim)}</div>
                          <div className="text-xs text-torg-gray mt-0.5">
                            {f.diasGozo} dias{f.diasVendidos ? ` + ${f.diasVendidos} vendidos` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-torg-dark tabular-nums">{fmtMoeda(f.valorEstimado)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>{st.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      )}

      <p className="text-center text-[11px] text-gray-400 mt-8">Workspace Torg — uso interno / confidencial</p>
    </div>
  );
}
