"use client";
import { useState, useMemo, useEffect, useCallback, Fragment } from "react";
import { useStore } from "@/lib/store";
import { fmtOP } from "@/lib/utils";
import { numeroBR } from "@/lib/numero-br";
import {
  Factory, Plus, Search, Loader2, AlertCircle, X, Pencil, Trash2,
  Truck, PackageCheck, PackageOpen, Clock, ChevronDown, ChevronRight,
  FileSpreadsheet, Undo2, RotateCcw,
} from "lucide-react";

const fmtKg = (n) => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`);
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const hojeISO = () => new Date().toLocaleDateString("en-CA");
const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

const STATUS = {
  ENVIADO: { label: "No terceiro", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PARCIAL: { label: "Retorno parcial", cls: "bg-torg-blue-50 text-torg-blue border-torg-blue-100" },
  RETORNADO: { label: "Retornado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELADO: { label: "Cancelado", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function TerceirizadosClient({ ops }) {
  const { showToast } = useStore();
  const [romaneios, setRomaneios] = useState(null);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState({});
  const [modal, setModal] = useState(null);   // { rom } editar | {} novo
  const [retorno, setRetorno] = useState(null); // rom p/ registrar retorno

  const carregar = useCallback(() => {
    setErro("");
    fetch("/api/expedicao/terceiros")
      .then((r) => r.json())
      .then((j) => { if (j.success) setRomaneios(j.romaneios); else { setRomaneios([]); setErro(j.error || "Erro"); } })
      .catch(() => { setRomaneios([]); setErro("Erro ao carregar"); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const hoje = hojeISO();
  const kpis = useMemo(() => {
    const lista = romaneios || [];
    const fora = lista.filter((r) => r.status === "ENVIADO" || r.status === "PARCIAL");
    const pesoPendente = fora.reduce((s, r) => s + Math.max(0, (r.pesoEnviadoKg || 0) - (r.pesoRetornadoKg || 0)), 0);
    const atrasados = fora.filter((r) => r.dataPrevRetorno && String(r.dataPrevRetorno).slice(0, 10) < hoje).length;
    const mesAtual = new Date().toISOString().slice(0, 7);
    const retornadosMes = lista.filter((r) => r.status === "RETORNADO" && String(r.updatedAt).slice(0, 7) === mesAtual).length;
    return { fora: fora.length, pesoPendente, atrasados, retornadosMes };
  }, [romaneios, hoje]);

  const filtrados = useMemo(() => {
    let lista = romaneios || [];
    if (filtroStatus !== "todos") lista = lista.filter((r) => r.status === filtroStatus);
    const q = busca.trim().toLowerCase();
    if (q) lista = lista.filter((r) =>
      r.terceiroNome?.toLowerCase().includes(q) ||
      r.servico?.toLowerCase().includes(q) ||
      r.opRefNumero?.toLowerCase().includes(q) ||
      String(r.numero).includes(q)
    );
    return lista;
  }, [romaneios, filtroStatus, busca]);

  async function excluir(r) {
    if (!confirm(`Excluir o romaneio RT-${String(r.numero).padStart(3, "0")}?`)) return;
    const res = await fetch(`/api/expedicao/terceiros/${r.id}`, { method: "DELETE" });
    const j = await res.json();
    if (j.success) { setRomaneios((prev) => prev.filter((x) => x.id !== r.id)); showToast("Romaneio excluído", "success"); }
    else showToast(j.error || "Erro ao excluir", "erro");
  }
  const aplicar = (rom) => setRomaneios((prev) => prev.map((x) => (x.id === rom.id ? rom : x)));

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-3">
            <Factory size={28} className="text-torg-orange" /> Romaneios Terceirizados
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Material enviado a terceiros pra trabalhar (galvanização, usinagem, pintura…) — controle de envio e retorno. À parte do romaneio da obra.
          </p>
        </div>
        <button onClick={() => setModal({})}
          className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2">
          <Plus size={16} /> Novo romaneio terceirizado
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="No terceiro" value={String(kpis.fora)} sub={`${fmtKg(kpis.pesoPendente)} pendente`} color="bg-torg-blue" Icon={PackageOpen} />
        <Kpi label="Peso pendente" value={fmtKg(kpis.pesoPendente)} sub="a retornar" color="bg-torg-orange" Icon={Truck} />
        <Kpi label="Atrasados" value={String(kpis.atrasados)} sub="retorno vencido" color={kpis.atrasados ? "bg-red-600" : "bg-torg-gray"} Icon={Clock} />
        <Kpi label="Retornados (mês)" value={String(kpis.retornadosMes)} sub="concluídos" color="bg-emerald-600" Icon={PackageCheck} />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {[["todos", "Todos"], ["ENVIADO", "No terceiro"], ["PARCIAL", "Parcial"], ["RETORNADO", "Retornados"]].map(([v, l]) => (
            <button key={v} onClick={() => setFiltroStatus(v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${filtroStatus === v ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar terceiro, serviço, OP, nº…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {romaneios === null ? (
          <p className="px-6 py-10 text-sm text-torg-gray text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando…</p>
        ) : erro ? (
          <div className="px-6 py-10 text-center">
            <AlertCircle size={22} className="mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 mb-3">{erro}</p>
            <button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Factory size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-torg-dark">Nenhum romaneio terceirizado</p>
            <p className="text-xs text-torg-gray mt-1">Clique em "Novo romaneio terceirizado" para registrar um envio.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50/60">
                <tr className="text-[11px] text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left font-medium">Nº</th>
                  <th className="px-3 py-2 text-left font-medium">Terceiro / Serviço</th>
                  <th className="px-3 py-2 text-left font-medium">OP ref.</th>
                  <th className="px-3 py-2 text-right font-medium">Enviado</th>
                  <th className="px-3 py-2 text-right font-medium">Retornado / Pend.</th>
                  <th className="px-3 py-2 text-left font-medium">Envio</th>
                  <th className="px-3 py-2 text-left font-medium">Prev. retorno</th>
                  <th className="px-3 py-2 text-left font-medium">Situação</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((r) => {
                  const aberto = !!expandido[r.id];
                  const pend = Math.max(0, (r.pesoEnviadoKg || 0) - (r.pesoRetornadoKg || 0));
                  const atrasado = (r.status === "ENVIADO" || r.status === "PARCIAL") && r.dataPrevRetorno && String(r.dataPrevRetorno).slice(0, 10) < hoje;
                  const st = STATUS[r.status] || STATUS.ENVIADO;
                  return (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-gray-50/60">
                        <td className="px-3 py-2 font-mono text-torg-dark text-xs whitespace-nowrap">
                          <button onClick={() => setExpandido((e) => ({ ...e, [r.id]: !aberto }))} className="text-torg-gray hover:text-torg-blue mr-1 align-middle">
                            {aberto ? <ChevronDown size={13} className="inline" /> : <ChevronRight size={13} className="inline" />}
                          </button>
                          RT-{String(r.numero).padStart(3, "0")}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-torg-dark font-medium">{r.terceiroNome}</span>
                          {r.servico && <span className="block text-[11px] text-torg-gray">{r.servico}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-torg-blue">{r.opRefNumero ? fmtOP(r.opRefNumero) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap">{fmtKg(r.pesoEnviadoKg)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          <span className="text-emerald-700">{fmtKg(r.pesoRetornadoKg)}</span>
                          {pend > 0.01 && <span className="text-torg-gray text-[11px] block">falta {fmtKg(pend)}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">{fmtD(r.dataEnvio)}</td>
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${atrasado ? "text-red-600 font-semibold" : "text-torg-gray"}`}>
                          {fmtD(r.dataPrevRetorno)}{atrasado && " ⚠"}
                        </td>
                        <td className="px-3 py-2"><span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>{st.label}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {r.status !== "RETORNADO" && r.status !== "CANCELADO" && (
                              <button onClick={() => setRetorno(r)} title="Registrar retorno"
                                className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                <Undo2 size={12} /> Retorno
                              </button>
                            )}
                            <a href={`/api/expedicao/terceiros/${r.id}/romaneio`} title="Romaneio de peças (Excel)" className="text-torg-gray hover:text-torg-blue p-1"><FileSpreadsheet size={15} /></a>
                            {Array.isArray(r.materiais) && r.materiais.length > 0 && (
                              <a href={`/api/expedicao/terceiros/${r.id}/material`} title="Romaneio de material — enviado ao fornecedor (Excel)" className="text-indigo-600 hover:text-indigo-800 p-1"><FileSpreadsheet size={15} /></a>
                            )}
                            <button onClick={() => setModal({ rom: r })} title="Editar" className="text-torg-gray hover:text-torg-blue p-1"><Pencil size={14} /></button>
                            <button onClick={() => excluir(r)} title="Excluir" className="text-torg-gray hover:text-red-600 p-1"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                      {aberto && (
                        <tr>
                          <td colSpan={9} className="px-4 py-3 bg-gray-50/60">
                            <DetalheRomaneio r={r} onDesfazRetorno={aplicar} showToast={showToast} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <ModalRomaneio ops={ops} rom={modal.rom} onClose={() => setModal(null)} onSalvo={(rom, novo) => { setModal(null); if (novo) carregar(); else aplicar(rom); showToast(novo ? "Romaneio criado" : "Romaneio atualizado", "success"); }} />}
      {retorno && <ModalRetorno rom={retorno} onClose={() => setRetorno(null)} onSalvo={(rom) => { setRetorno(null); aplicar(rom); showToast("Retorno registrado", "success"); }} />}
    </div>
  );
}

function Kpi({ label, value, sub, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg`}><Icon size={20} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-xs text-torg-gray truncate">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>
        {sub && <p className="text-[10px] text-torg-gray truncate">{sub}</p>}
      </div>
    </div>
  );
}

function DetalheRomaneio({ r, onDesfazRetorno, showToast }) {
  const itens = Array.isArray(r.itens) ? r.itens : [];
  const materiais = Array.isArray(r.materiais) ? r.materiais : [];
  const retornos = Array.isArray(r.retornos) ? r.retornos : [];
  async function desfazer(ret) {
    if (!confirm("Desfazer este retorno?")) return;
    const res = await fetch(`/api/expedicao/terceiros/${r.id}/retorno?retornoId=${ret.id}`, { method: "DELETE" });
    const j = await res.json();
    if (j.success) { onDesfazRetorno(j.romaneio); showToast("Retorno desfeito", "success"); }
    else showToast(j.error || "Erro", "erro");
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Romaneio de MATERIAL — o que efetivamente vai pro fornecedor (matéria-prima
          com código do Omie). Vem primeiro por ser o principal do envio a terceiro. */}
      {materiais.length > 0 && (
        <div className="md:col-span-2">
          <p className="text-[11px] font-semibold text-indigo-700 uppercase mb-1 flex items-center gap-1.5"><FileSpreadsheet size={12} /> Material enviado ao fornecedor ({materiais.length})</p>
          <div className="border border-gray-100 rounded bg-white max-h-60 overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="bg-gray-50 text-torg-gray"><tr>
                <th className="text-left px-2 py-1 font-medium">Cód. Omie</th>
                <th className="text-left px-2 py-1 font-medium">Perfil</th>
                <th className="text-left px-2 py-1 font-medium">Descrição / unidade</th>
                <th className="text-right px-2 py-1 font-medium">Qtd</th>
                <th className="text-right px-2 py-1 font-medium">Peso</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {materiais.map((m, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 font-mono text-[11px] whitespace-nowrap">{m.codigoOmie || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1 font-mono text-torg-dark whitespace-nowrap">{m.perfil}</td>
                    <td className="px-2 py-1 text-torg-gray truncate max-w-[300px]" title={m.descricaoOmie || m.descricao || ""}>{[m.descricaoOmie || m.descricao, m.unidade].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold">{m.qtd ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtKg(m.pesoKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold text-torg-gray uppercase mb-1">Peças / marcas ({itens.length}){materiais.length > 0 && <span className="normal-case font-normal text-torg-gray"> — controle do que o terceiro produz</span>}</p>
        <div className="border border-gray-100 rounded bg-white max-h-52 overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-torg-gray"><tr>
              <th className="text-left px-2 py-1 font-medium">Marca</th>
              <th className="text-left px-2 py-1 font-medium">Descrição</th>
              <th className="text-right px-2 py-1 font-medium">Qtd</th>
              <th className="text-right px-2 py-1 font-medium">Peso</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((it, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-mono text-torg-dark">{it.marca}</td>
                  <td className="px-2 py-1 text-torg-gray">{it.descricao || "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{it.qte ?? "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtKg(it.pesoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-torg-gray uppercase mb-1">Retornos ({retornos.length})</p>
        {retornos.length === 0 ? (
          <p className="text-[12px] text-torg-gray py-2">Nenhum retorno registrado ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {retornos.slice().reverse().map((ret) => (
              <li key={ret.id} className="border border-gray-100 rounded bg-white px-2.5 py-1.5 text-[12px] flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-torg-dark">{fmtD(ret.data)}</span>
                  <span className="text-torg-gray"> · {fmtKg(ret.pesoKg)} · {(ret.itens || []).length} marca(s)</span>
                  {ret.porNome && <span className="text-torg-gray"> · {ret.porNome}</span>}
                  {ret.observacao && <span className="block text-torg-gray italic">{ret.observacao}</span>}
                </div>
                <button onClick={() => desfazer(ret)} title="Desfazer" className="text-gray-300 hover:text-red-600 shrink-0"><RotateCcw size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {r.observacao && <p className="md:col-span-2 text-[12px] text-torg-gray italic">Obs.: {r.observacao}</p>}
    </div>
  );
}

// ── modal criar/editar ────────────────────────────────────────────────────────
function ModalRomaneio({ ops, rom, onClose, onSalvo }) {
  const edit = !!rom;
  const [f, setF] = useState({
    fornecedorId: rom?.fornecedorId || null,
    terceiroNome: rom?.terceiroNome || "",
    servico: rom?.servico || "",
    opRefId: rom?.opRefId || "",
    opRefNumero: rom?.opRefNumero || "",
    transportadora: rom?.transportadora || "",
    motorista: rom?.motorista || "",
    placaVeiculo: rom?.placaVeiculo || "",
    placaCarreta: rom?.placaCarreta || "",
    contatoTransporte: rom?.contatoTransporte || "",
    dataEnvio: rom?.dataEnvio ? String(rom.dataEnvio).slice(0, 10) : hojeISO(),
    dataPrevRetorno: rom?.dataPrevRetorno ? String(rom.dataPrevRetorno).slice(0, 10) : "",
    observacao: rom?.observacao || "",
  });
  const [itens, setItens] = useState(
    Array.isArray(rom?.itens) && rom.itens.length
      ? rom.itens.map((it) => ({ marca: it.marca || "", descricao: it.descricao || "", qte: it.qte ?? "", pesoTotal: it.pesoTotal ?? "" }))
      : [{ marca: "", descricao: "", qte: "", pesoTotal: "" }]
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // busca de fornecedores (Vendor List) — combobox
  const [buscaForn, setBuscaForn] = useState("");
  const [forns, setForns] = useState([]);
  const [showForn, setShowForn] = useState(false);
  useEffect(() => {
    if (!showForn) return;
    const q = buscaForn.trim();
    const t = setTimeout(() => {
      fetch(`/api/fornecedores?ativos=1${q ? `&busca=${encodeURIComponent(q)}` : ""}`)
        .then((r) => r.json()).then((j) => setForns((j.fornecedores || []).slice(0, 20))).catch(() => setForns([]));
    }, 220);
    return () => clearTimeout(t);
  }, [buscaForn, showForn]);

  const setItem = (i, k, v) => setItens((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addItem = () => setItens((arr) => [...arr, { marca: "", descricao: "", qte: "", pesoTotal: "" }]);
  const delItem = (i) => setItens((arr) => (arr.length === 1 ? arr : arr.filter((_, j) => j !== i)));
  const num = (v) => (v === "" || v == null ? null : numeroBR(v, NaN));
  const pesoTotalCarga = itens.reduce((s, it) => s + (num(it.pesoTotal) || 0), 0);

  function escolherForn(fr) {
    setF((v) => ({ ...v, fornecedorId: fr.id, terceiroNome: fr.nomeFantasia || fr.razaoSocial || v.terceiroNome }));
    setShowForn(false); setBuscaForn("");
  }
  function escolherOp(id) {
    const op = ops.find((o) => o.id === id);
    setF((v) => ({ ...v, opRefId: id || "", opRefNumero: op?.numero || "" }));
  }

  async function salvar() {
    setErro("");
    if (!f.terceiroNome.trim()) return setErro("Informe o terceiro.");
    const itensLimpos = itens
      .filter((it) => it.marca.trim())
      .map((it) => ({ marca: it.marca.trim(), descricao: it.descricao.trim() || null, qte: num(it.qte), pesoTotal: num(it.pesoTotal) }));
    if (!itensLimpos.length) return setErro("Adicione ao menos uma peça (marca).");
    setSalvando(true);
    const payload = {
      fornecedorId: f.fornecedorId || null,
      terceiroNome: f.terceiroNome.trim(),
      servico: f.servico.trim() || null,
      opRefId: f.opRefId || null,
      opRefNumero: f.opRefNumero || null,
      transportadora: f.transportadora.trim() || null,
      motorista: f.motorista.trim() || null,
      placaVeiculo: f.placaVeiculo.trim() || null,
      placaCarreta: f.placaCarreta.trim() || null,
      contatoTransporte: f.contatoTransporte.trim() || null,
      itens: itensLimpos,
      dataEnvio: f.dataEnvio || null,
      dataPrevRetorno: f.dataPrevRetorno || null,
      observacao: f.observacao.trim() || null,
    };
    try {
      const url = edit ? `/api/expedicao/terceiros/${rom.id}` : `/api/expedicao/terceiros`;
      const res = await fetch(url, { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Erro");
      onSalvo(j.romaneio, !edit);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
          <h3 className="text-sm font-semibold text-torg-dark">{edit ? `Editar RT-${String(rom.numero).padStart(3, "0")}` : "Novo romaneio terceirizado"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5" /><span>{erro}</span></div>}

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Terceiro (Vendor List + livre) */}
            <div className="relative">
              <label className="block text-xs font-medium text-torg-dark mb-1">Terceiro *</label>
              <input value={f.terceiroNome} onChange={(e) => setF((v) => ({ ...v, terceiroNome: e.target.value, fornecedorId: null }))}
                onFocus={() => setShowForn(true)} placeholder="Nome do terceiro (ou busque no cadastro)" className={inp} />
              <button type="button" onClick={() => setShowForn((s) => !s)} className="absolute right-2 top-[30px] text-gray-400 hover:text-torg-blue"><Search size={15} /></button>
              {showForn && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  <div className="p-2 border-b border-gray-100">
                    <input autoFocus value={buscaForn} onChange={(e) => setBuscaForn(e.target.value)} placeholder="Buscar no Vendor List…" className="w-full text-sm border border-gray-200 rounded px-2 py-1.5" />
                  </div>
                  {forns.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-torg-gray">Digite pra buscar. Ou deixe o nome digitado (fora do cadastro).</p>
                  ) : forns.map((fr) => (
                    <button key={fr.id} type="button" onClick={() => escolherForn(fr)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-torg-blue-50">
                      <span className="text-torg-dark">{fr.nomeFantasia || fr.razaoSocial}</span>
                      {fr.nomeFantasia && fr.razaoSocial && <span className="block text-[11px] text-torg-gray">{fr.razaoSocial}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Serviço</label>
              <input value={f.servico} onChange={(e) => setF((v) => ({ ...v, servico: e.target.value }))} placeholder="Ex: galvanização, usinagem, pintura" className={inp} />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">OP referência <span className="text-torg-gray font-normal">— opcional</span></label>
              <select value={f.opRefId} onChange={(e) => escolherOp(e.target.value)} className={inp}>
                <option value="">— Nenhuma —</option>
                {ops.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data de envio</label>
              <input type="date" value={f.dataEnvio} onChange={(e) => setF((v) => ({ ...v, dataEnvio: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Previsão de retorno</label>
              <input type="date" value={f.dataPrevRetorno} onChange={(e) => setF((v) => ({ ...v, dataPrevRetorno: e.target.value }))} className={inp} />
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-torg-dark">Material enviado *</label>
              <span className="text-[11px] text-torg-gray">Total: <strong className="text-torg-dark">{fmtKg(pesoTotalCarga)}</strong></span>
            </div>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] text-torg-gray uppercase"><tr>
                  <th className="text-left px-2 py-1.5 font-medium">Marca</th>
                  <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
                  <th className="text-right px-2 py-1.5 font-medium w-20">Qtd</th>
                  <th className="text-right px-2 py-1.5 font-medium w-28">Peso (kg)</th>
                  <th className="w-8"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((it, i) => (
                    <tr key={i}>
                      <td className="px-1 py-1"><input value={it.marca} onChange={(e) => setItem(i, "marca", e.target.value)} placeholder="T64A" className="w-full text-sm border border-gray-200 rounded px-2 py-1 font-mono" /></td>
                      <td className="px-1 py-1"><input value={it.descricao} onChange={(e) => setItem(i, "descricao", e.target.value)} placeholder="—" className="w-full text-sm border border-gray-200 rounded px-2 py-1" /></td>
                      <td className="px-1 py-1"><input value={it.qte} onChange={(e) => setItem(i, "qte", e.target.value)} inputMode="numeric" placeholder="0" className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-right" /></td>
                      <td className="px-1 py-1"><input value={it.pesoTotal} onChange={(e) => setItem(i, "pesoTotal", e.target.value)} inputMode="decimal" placeholder="0,00" className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-right" /></td>
                      <td className="px-1 py-1 text-center"><button type="button" onClick={() => delItem(i)} className="text-gray-300 hover:text-red-600"><X size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addItem} className="mt-2 text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Plus size={13} /> Adicionar peça</button>
          </div>

          {/* Transporte */}
          <details className="border border-gray-100 rounded-lg">
            <summary className="px-3 py-2 text-xs font-medium text-torg-dark cursor-pointer flex items-center gap-2"><Truck size={14} className="text-torg-gray" /> Transporte <span className="text-torg-gray font-normal">(opcional)</span></summary>
            <div className="px-3 pb-3 grid sm:grid-cols-2 gap-3">
              <div><label className="block text-xs text-torg-dark mb-1">Transportadora</label><input value={f.transportadora} onChange={(e) => setF((v) => ({ ...v, transportadora: e.target.value }))} className={inp} /></div>
              <div><label className="block text-xs text-torg-dark mb-1">Motorista</label><input value={f.motorista} onChange={(e) => setF((v) => ({ ...v, motorista: e.target.value }))} className={inp} /></div>
              <div><label className="block text-xs text-torg-dark mb-1">Placa veículo</label><input value={f.placaVeiculo} onChange={(e) => setF((v) => ({ ...v, placaVeiculo: e.target.value }))} className={inp} /></div>
              <div><label className="block text-xs text-torg-dark mb-1">Placa carreta</label><input value={f.placaCarreta} onChange={(e) => setF((v) => ({ ...v, placaCarreta: e.target.value }))} className={inp} /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-torg-dark mb-1">Contato</label><input value={f.contatoTransporte} onChange={(e) => setF((v) => ({ ...v, contatoTransporte: e.target.value }))} className={inp} /></div>
            </div>
          </details>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <textarea value={f.observacao} onChange={(e) => setF((v) => ({ ...v, observacao: e.target.value }))} rows={2} className={inp} />
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {salvando && <Loader2 size={14} className="animate-spin" />} {edit ? "Salvar" : "Criar romaneio"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── modal registrar retorno (parcial, por peça) ───────────────────────────────
function ModalRetorno({ rom, onClose, onSalvo }) {
  const itens = Array.isArray(rom.itens) ? rom.itens : [];
  const [sel, setSel] = useState(() => itens.map((it) => ({ marca: it.marca, qte: it.qte ?? "", pesoTotal: it.pesoTotal ?? "", on: false })));
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const num = (v) => (v === "" || v == null ? null : numeroBR(v, NaN));
  const set = (i, k, v) => setSel((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const escolhidos = sel.filter((s) => s.on);
  const pesoRetorno = escolhidos.reduce((s, x) => s + (num(x.pesoTotal) || 0), 0);

  function marcarTodos(on) { setSel((arr) => arr.map((x) => ({ ...x, on }))); }

  async function salvar() {
    setErro("");
    if (!escolhidos.length) return setErro("Selecione ao menos uma peça que voltou.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/expedicao/terceiros/${rom.id}/retorno`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, observacao: obs.trim() || null, itens: escolhidos.map((x) => ({ marca: x.marca, qte: num(x.qte), pesoTotal: num(x.pesoTotal) })) }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Erro");
      onSalvo(j.romaneio);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Undo2 size={16} className="text-emerald-600" /> Registrar retorno — RT-{String(rom.numero).padStart(3, "0")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5" /><span>{erro}</span></div>}
          <p className="text-xs text-torg-gray">Marque as peças que voltaram do terceiro. Dá pra ajustar qtd/peso (retorno parcial). Enviado: <strong>{fmtKg(rom.pesoEnviadoKg)}</strong> · já retornado: <strong>{fmtKg(rom.pesoRetornadoKg)}</strong>.</p>
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => marcarTodos(true)} className="text-torg-blue hover:underline">Marcar todos</button>
            <button onClick={() => marcarTodos(false)} className="text-torg-gray hover:underline">Limpar</button>
          </div>
          <div className="border border-gray-100 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] text-torg-gray uppercase sticky top-0"><tr>
                <th className="w-8 px-2 py-1.5"></th>
                <th className="text-left px-2 py-1.5 font-medium">Marca</th>
                <th className="text-right px-2 py-1.5 font-medium w-24">Qtd</th>
                <th className="text-right px-2 py-1.5 font-medium w-28">Peso (kg)</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {sel.map((s, i) => (
                  <tr key={i} className={s.on ? "bg-emerald-50/40" : ""}>
                    <td className="px-2 py-1 text-center"><input type="checkbox" checked={s.on} onChange={(e) => set(i, "on", e.target.checked)} /></td>
                    <td className="px-2 py-1 font-mono text-torg-dark">{s.marca}</td>
                    <td className="px-1 py-1"><input value={s.qte} onChange={(e) => set(i, "qte", e.target.value)} disabled={!s.on} inputMode="numeric" className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-right disabled:bg-gray-50" /></td>
                    <td className="px-1 py-1"><input value={s.pesoTotal} onChange={(e) => set(i, "pesoTotal", e.target.value)} disabled={!s.on} inputMode="decimal" className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-right disabled:bg-gray-50" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data do retorno</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inp} />
            </div>
            <div className="flex items-end">
              <p className="text-sm text-torg-gray">Peso deste retorno: <strong className="text-emerald-700">{fmtKg(pesoRetorno)}</strong></p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className={inp} />
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {salvando && <Loader2 size={14} className="animate-spin" />} Registrar retorno
          </button>
        </div>
      </div>
    </div>
  );
}
