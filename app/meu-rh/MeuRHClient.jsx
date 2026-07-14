"use client";
import { useState, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import {
  Receipt, Loader2, AlertCircle, RefreshCw, Inbox, LogOut, FileText, CheckCircle2,
  CalendarDays, Palmtree, KeyRound, Download, Megaphone, MessageSquarePlus, Pin, Send, X, Clock, UserRound,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

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
  const [aba, setAba] = useState("mural");

  // Mural (comunicados do RH)
  const [avisos, setAvisos] = useState([]);
  const [carregandoMural, setCarregandoMural] = useState(true);
  const [erroMural, setErroMural] = useState("");

  // Feedback / sugestão ao RH
  const [fbAberto, setFbAberto] = useState(false);
  const [fbCategoria, setFbCategoria] = useState("SUGESTAO");
  const [fbMensagem, setFbMensagem] = useState("");
  const [fbAnonimo, setFbAnonimo] = useState(false);
  const [fbEnviando, setFbEnviando] = useState(false);

  // Holerites
  const [holerites, setHolerites] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(null);
  const [baixando, setBaixando] = useState(null);

  // Férias
  const [ferias, setFerias] = useState([]);
  const [periodoFerias, setPeriodoFerias] = useState(null);
  const [carregandoFerias, setCarregandoFerias] = useState(true);
  const [erroFerias, setErroFerias] = useState("");

  // Ponto
  const [pontoComps, setPontoComps] = useState([]);
  const [carregandoPonto, setCarregandoPonto] = useState(true);
  const [erroPonto, setErroPonto] = useState("");

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

  const carregarMural = useCallback(async () => {
    setCarregandoMural(true); setErroMural("");
    try {
      const r = await fetch("/api/meu-rh/mural");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setAvisos(d.avisos || []);
    } catch (e) { setErroMural(e.message); } finally { setCarregandoMural(false); }
  }, []);

  const carregarPonto = useCallback(async () => {
    setCarregandoPonto(true); setErroPonto("");
    try {
      const r = await fetch("/api/meu-rh/ponto");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setPontoComps(d.cartoes || []);
    } catch (e) { setErroPonto(e.message); } finally { setCarregandoPonto(false); }
  }, []);

  useEffect(() => { carregarMural(); carregar(); carregarFerias(); carregarPonto(); }, [carregarMural, carregar, carregarFerias, carregarPonto]);

  const enviarFeedback = async () => {
    if (fbMensagem.trim().length < 3) return;
    setFbEnviando(true);
    try {
      const r = await fetch("/api/meu-rh/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: fbMensagem, categoria: fbCategoria, anonimo: fbAnonimo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao enviar");
      setFbAberto(false); setFbMensagem(""); setFbAnonimo(false); setFbCategoria("SUGESTAO");
      alert("Enviado! O RH recebeu sua mensagem. Obrigado. 🙌");
    } catch (e) {
      alert(e.message || "Não foi possível enviar. Tente novamente.");
    } finally { setFbEnviando(false); }
  };

  const abrir = (id) => {
    window.open(`/api/meu-rh/holerite/${id}/arquivo`, "_blank", "noopener");
    setTimeout(carregar, 1500);
  };

  // Baixa o PDF direto (blob + <a download>) — força o download em qualquer
  // navegador, inclusive mobile, onde o Content-Disposition sozinho às vezes
  // abre o PDF inline em vez de salvar.
  const baixar = async (h) => {
    setBaixando(h.id);
    try {
      const r = await fetch(`/api/meu-rh/holerite/${h.id}/arquivo?download=1`);
      if (!r.ok) throw new Error("Falha ao baixar");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `holerite-${h.competencia}-${(h.tipo || "MENSAL").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      carregar();
    } catch {
      alert("Não foi possível baixar o holerite. Tente novamente.");
    } finally {
      setBaixando(null);
    }
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
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      {/* Hero: foto industrial da TORG + overlay. Edge-to-edge no celular,
          card arredondado no desktop. */}
      <header className="relative -mx-4 -mt-6 sm:-mt-8 mb-6 sm:mx-0 sm:mt-0 overflow-hidden sm:rounded-2xl shadow-sm">
        {/* Fundo */}
        <div className="absolute inset-0">
          <Image src="/obras/planta-industrial.jpg" alt="" fill priority sizes="(max-width: 768px) 100vw, 768px" className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-br from-torg-dark/95 via-torg-dark/80 to-torg-blue/70" />
        </div>

        {/* Conteúdo */}
        <div className="relative px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6">
          {/* Topo: logo + Sair */}
          <div className="flex items-center justify-between gap-3">
            <Image src="/torg-logo-white.png" alt="Torg Metal" width={120} height={34} priority className="h-7 sm:h-8 w-auto" />
            <button onClick={() => signOut({ callbackUrl: "/colaborador" })}
              className="shrink-0 text-sm text-white/90 hover:text-white inline-flex items-center gap-1.5 border border-white/25 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors">
              <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>

          {/* Saudação */}
          <div className="mt-6 flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-white/15 ring-1 ring-white/30 flex items-center justify-center text-white shrink-0 backdrop-blur-sm">
              <UserRound size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-torg-orange font-semibold">Portal do Colaborador</p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight truncate">Olá, {nome}</h1>
            </div>
          </div>

          {/* Ações secundárias — pílulas translúcidas, quebram no celular */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button onClick={() => setFbAberto(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-white/15 hover:bg-white/25 border border-white/15 rounded-lg px-3 py-1.5 backdrop-blur-sm transition-colors">
              <MessageSquarePlus size={16} /> Enviar sugestão
            </button>
            <Link href="/colaborador/trocar-senha"
              className="inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5 backdrop-blur-sm transition-colors">
              <KeyRound size={16} /> Trocar senha
            </Link>
          </div>
        </div>
      </header>

      {/* Abas — rolam na horizontal no celular */}
      <div className="-mx-4 px-4 mb-6 overflow-x-auto">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
        <button onClick={() => setAba("mural")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "mural" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Megaphone size={15} /> Mural
        </button>
        <button onClick={() => setAba("holerites")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "holerites" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Receipt size={15} /> Holerites
        </button>
        <button onClick={() => setAba("ferias")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "ferias" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Palmtree size={15} /> Férias
        </button>
        <button onClick={() => setAba("ponto")}
          className={`px-4 py-2 text-sm font-medium rounded-lg inline-flex items-center gap-2 transition-colors ${aba === "ponto" ? "bg-white text-torg-dark shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
          <Clock size={15} /> Ponto
        </button>
      </div>
      </div>

      {aba === "mural" && (
        carregandoMural ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
        ) : erroMural ? (
          <div className="py-16 text-center">
            <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erroMural}</p>
            <button onClick={carregarMural} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : avisos.length === 0 ? (
          <div className="py-16 text-center">
            <Megaphone size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">Nenhum comunicado no momento.</p>
            <p className="text-sm text-torg-gray mt-1">Avisos e atualizações do RH aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {avisos.map((a) => (
              <div key={a.id} className={`bg-white rounded-xl border shadow-sm p-4 ${a.fixado ? "border-torg-blue-200 bg-torg-blue-50/30" : "border-gray-100"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {a.fixado && <Pin size={14} className="text-torg-blue shrink-0" />}
                  <span className="font-semibold text-torg-dark">{a.titulo}</span>
                </div>
                {a.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.imagemUrl} alt="" className="mt-2 w-full rounded-lg border border-gray-100" />
                )}
                <p className="text-sm text-torg-dark/80 mt-1.5 whitespace-pre-wrap">{a.corpo}</p>
                <p className="text-[11px] text-torg-gray mt-2">{a.criadoPorNome ? `${a.criadoPorNome} · ` : "RH · "}{new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        )
      )}

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
                    <button onClick={() => baixar(h)} disabled={baixando === h.id}
                      className="px-3 py-2 bg-white border border-gray-200 text-torg-gray text-sm rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2 disabled:opacity-50" title="Baixar PDF">
                      {baixando === h.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Baixar
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

      {aba === "ponto" && (
        carregandoPonto ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
        ) : erroPonto ? (
          <div className="py-16 text-center">
            <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erroPonto}</p>
            <button onClick={carregarPonto} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
          </div>
        ) : pontoComps.length === 0 ? (
          <div className="py-16 text-center">
            <Clock size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">Seu cartão de ponto ainda não foi disponibilizado.</p>
            <p className="text-sm text-torg-gray mt-1">Quando o RH importar, o espelho do mês aparece aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pontoComps.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-semibold text-torg-dark">Cartão de ponto — {competenciaExtenso(c.competencia)}</div>
                  {c.empresa && <div className="text-xs text-torg-gray mt-0.5">{c.empresa}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/api/meu-rh/ponto/${c.id}/arquivo`} target="_blank" rel="noopener"
                    className="px-3 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2">
                    <FileText size={15} /> Ver cartão
                  </a>
                  <a href={`/api/meu-rh/ponto/${c.id}/arquivo?download=1`}
                    className="px-3 py-2 bg-white border border-gray-200 text-torg-gray text-sm rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2" title="Baixar PDF">
                    <Download size={15} /> Baixar
                  </a>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-torg-gray">Cartão de ponto do mês. Em caso de divergência, procure o RH.</p>
          </div>
        )
      )}

      {fbAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !fbEnviando && setFbAberto(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2"><MessageSquarePlus size={18} className="text-torg-blue" /> Enviar sugestão ao RH</h3>
              <button onClick={() => setFbAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <label className="text-xs text-torg-gray">Tipo</label>
            <select value={fbCategoria} onChange={(e) => setFbCategoria(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 mt-1 focus:ring-2 focus:ring-torg-blue">
              <option value="SUGESTAO">Sugestão</option>
              <option value="RECLAMACAO">Reclamação</option>
              <option value="ELOGIO">Elogio</option>
              <option value="DUVIDA">Dúvida</option>
              <option value="OUTRO">Outro</option>
            </select>
            <textarea value={fbMensagem} onChange={(e) => setFbMensagem(e.target.value)} rows={5} maxLength={4000}
              placeholder="Escreva sua sugestão, ideia ou feedback para o RH…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue resize-y" />
            <label className="text-sm text-torg-gray inline-flex items-center gap-1.5 cursor-pointer select-none mt-2">
              <input type="checkbox" checked={fbAnonimo} onChange={(e) => setFbAnonimo(e.target.checked)} className="accent-torg-blue" />
              Enviar de forma anônima (o RH não verá seu nome)
            </label>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setFbAberto(false)} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
              <button onClick={enviarFeedback} disabled={fbEnviando || fbMensagem.trim().length < 3}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {fbEnviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-gray-400 mt-8">Workspace Torg — uso interno / confidencial</p>
    </div>
  );
}
