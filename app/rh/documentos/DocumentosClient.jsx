"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  FileText, PlusCircle, Loader2, AlertCircle, X, Search,
  ChevronDown, ShieldAlert, ShieldCheck, Clock, Building2,
  Users, AlertTriangle, CalendarClock, Download, Upload,
  FileSpreadsheet, CheckCircle2, XCircle, ClipboardCheck,
  ChevronRight, UserX, CircleAlert, BadgeCheck, Factory,
} from "lucide-react";

const CATEGORIAS = [
  { value: "SAUDE_SEGURANCA", label: "Saúde / Segurança", cor: "bg-red-100 text-red-800" },
  { value: "PESSOAL", label: "Pessoal", cor: "bg-blue-100 text-blue-800" },
  { value: "TREINAMENTO", label: "Treinamento", cor: "bg-purple-100 text-purple-800" },
  { value: "EMPRESA", label: "Empresa / Licenças", cor: "bg-amber-100 text-amber-800" },
];
const catMap = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c]));

const TIPOS = {
  SAUDE_SEGURANCA: [
    { value: "ASO", label: "ASO" },
    { value: "NR_10", label: "NR-10 (Eletricidade)" },
    { value: "NR_12", label: "NR-12 (Máquinas)" },
    { value: "NR_33", label: "NR-33 (Espaço Confinado)" },
    { value: "NR_35", label: "NR-35 (Altura)" },
    { value: "PPRA", label: "PPRA" },
    { value: "PCMSO", label: "PCMSO" },
  ],
  PESSOAL: [
    { value: "CNH", label: "CNH" },
    { value: "PASSAPORTE", label: "Passaporte" },
    { value: "CERTIDAO", label: "Certidão" },
    { value: "RG", label: "RG" },
  ],
  TREINAMENTO: [
    { value: "CERTIFICADO", label: "Certificado de Curso" },
    { value: "TREINAMENTO_NR", label: "Treinamento NR" },
    { value: "INTEGRACAO", label: "Integração" },
  ],
  EMPRESA: [
    { value: "ALVARA", label: "Alvará" },
    { value: "LICENCA_AMBIENTAL", label: "Licença Ambiental" },
    { value: "AVCB", label: "AVCB" },
    { value: "ISO", label: "Certificação ISO" },
    { value: "LICENCA_FUNCIONAMENTO", label: "Licença de Funcionamento" },
  ],
};

const TIPO_LABEL = {};
Object.values(TIPOS).flat().forEach((t) => { TIPO_LABEL[t.value] = t.label; });
TIPO_LABEL.OUTRO = "Outro";

const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

function calcStatus(dataValidade) {
  if (!dataValidade) return { key: "SEM_VALIDADE", label: "Sem validade", cor: "bg-gray-100 text-gray-600", icon: null };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const v = new Date(dataValidade); v.setHours(0, 0, 0, 0);
  const dias = Math.ceil((v - hoje) / 86400000);
  if (dias < 0) return { key: "VENCIDO", label: `Vencido há ${Math.abs(dias)}d`, cor: "bg-red-100 text-red-700", icon: ShieldAlert };
  if (dias <= 30) return { key: "VENCENDO_30", label: `Vence em ${dias}d`, cor: "bg-orange-100 text-orange-700", icon: AlertTriangle };
  if (dias <= 60) return { key: "VENCENDO_60", label: `Vence em ${dias}d`, cor: "bg-yellow-100 text-yellow-700", icon: Clock };
  return { key: "VALIDO", label: `Válido (${dias}d)`, cor: "bg-emerald-100 text-emerald-700", icon: ShieldCheck };
}

export default function DocumentosClient() {
  const [abaAtiva, setAbaAtiva] = useState("documentos"); // "documentos" | "compliance"
  const [documentos, setDocumentos] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [stats, setStats] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroVinculo, setFiltroVinculo] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Import Excel
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Compliance CCT
  const [compliance, setCompliance] = useState(null);
  const [carregandoCompliance, setCarregandoCompliance] = useState(false);
  const [complianceExpandido, setComplianceExpandido] = useState({});
  const [filtroCompliance, setFiltroCompliance] = useState("TODOS"); // TODOS, PENDENCIAS, CONFORMES

  const [form, setForm] = useState({
    nome: "", tipo: "", categoria: "SAUDE_SEGURANCA", descricao: "",
    funcionarioId: "", dataEmissao: "", dataValidade: "",
    orgaoEmissor: "", numeroDocumento: "", observacao: "",
  });

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (filtroCategoria) params.set("categoria", filtroCategoria);
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroVinculo) params.set("vinculo", filtroVinculo);
      if (busca) params.set("busca", busca);

      const [dRes, fRes] = await Promise.all([
        fetch(`/api/rh/documentos?${params}`).then((r) => r.json()),
        fetch("/api/rh/funcionarios").then((r) => r.json()),
      ]);
      if (!dRes.success) throw new Error(dRes.error);
      setDocumentos(dRes.data || []);
      setStats(dRes.stats || {});
      setFuncionarios(fRes.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [filtroCategoria, filtroStatus, filtroVinculo]);

  // Busca com debounce simples
  useEffect(() => {
    const t = setTimeout(() => carregar(), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const abrirNovo = () => {
    setForm({
      nome: "", tipo: "", categoria: "SAUDE_SEGURANCA", descricao: "",
      funcionarioId: "", dataEmissao: "", dataValidade: "",
      orgaoEmissor: "", numeroDocumento: "", observacao: "",
    });
    setModalAberto(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const body = {
        ...form,
        tipo: form.tipo || "OUTRO",
        funcionarioId: form.funcionarioId || null,
        descricao: form.descricao || null,
        dataEmissao: form.dataEmissao || null,
        dataValidade: form.dataValidade || null,
        orgaoEmissor: form.orgaoEmissor || null,
        numeroDocumento: form.numeroDocumento || null,
        observacao: form.observacao || null,
      };
      const res = await fetch("/api/rh/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      setModalAberto(false);
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // Baixar modelo Excel
  const baixarModelo = async () => {
    try {
      const res = await fetch("/api/rh/documentos/template");
      if (!res.ok) throw new Error("Erro ao gerar modelo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo-documentos-torg.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e.message);
    }
  };

  // Importar planilha
  const importarPlanilha = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileRef.current.value = "";

    setImportando(true);
    setErro("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/rh/documentos/importar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok && !data.detalhes) throw new Error(data.error || "Erro na importação");
      setImportResult(data);
      setModalImport(true);
      if (data.criados > 0) carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setImportando(false);
    }
  };

  // Carregar compliance
  const carregarCompliance = useCallback(async () => {
    setCarregandoCompliance(true);
    try {
      const res = await fetch("/api/rh/documentos/compliance");
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setCompliance(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregandoCompliance(false);
    }
  }, []);

  useEffect(() => {
    if (abaAtiva === "compliance" && !compliance) carregarCompliance();
  }, [abaAtiva, compliance, carregarCompliance]);

  const toggleExpandido = (id) => {
    setComplianceExpandido((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const funcionariosCompliance = useMemo(() => {
    if (!compliance?.funcionarios) return [];
    if (filtroCompliance === "PENDENCIAS") return compliance.funcionarios.filter((f) => f.percentual < 100);
    if (filtroCompliance === "CONFORMES") return compliance.funcionarios.filter((f) => f.percentual === 100);
    return compliance.funcionarios;
  }, [compliance, filtroCompliance]);

  // Tipos disponíveis baseado na categoria selecionada no form
  const tiposDisponiveis = TIPOS[form.categoria] || [];

  if (carregando && documentos.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando documentos…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Documentos</h2>
          <p className="text-sm text-torg-gray mt-1">Controle de documentos e validades</p>
        </div>
        {abaAtiva === "documentos" && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={baixarModelo}
              className="px-3 py-2 text-sm text-torg-blue border border-torg-blue/30 rounded-lg hover:bg-torg-blue/5 inline-flex items-center gap-2 font-medium">
              <Download size={15} /> Baixar modelo
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={importando}
              className="px-3 py-2 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 inline-flex items-center gap-2 font-medium disabled:opacity-50">
              {importando ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {importando ? "Importando…" : "Importar planilha"}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={importarPlanilha} className="hidden" />
            <button onClick={abrirNovo}
              className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2">
              <PlusCircle size={16} /> Novo Documento
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setAbaAtiva("documentos")}
          className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors ${
            abaAtiva === "documentos"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark hover:border-gray-300"
          }`}>
          <FileText size={15} /> Documentos
        </button>
        <button onClick={() => setAbaAtiva("compliance")}
          className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 border-b-2 transition-colors ${
            abaAtiva === "compliance"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark hover:border-gray-300"
          }`}>
          <ClipboardCheck size={15} /> Conformidade CCT
          {compliance?.resumo?.totalPendencias > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
              {compliance.resumo.totalPendencias}
            </span>
          )}
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      {/* ═══════ ABA COMPLIANCE CCT ═══════ */}
      {abaAtiva === "compliance" && (
        <CompliancePanel
          compliance={compliance}
          carregando={carregandoCompliance}
          funcionarios={funcionariosCompliance}
          filtro={filtroCompliance}
          setFiltro={setFiltroCompliance}
          expandido={complianceExpandido}
          toggleExpandido={toggleExpandido}
          onRecarregar={carregarCompliance}
        />
      )}

      {/* ═══════ ABA DOCUMENTOS ═══════ */}
      {abaAtiva === "documentos" && (<>
      {/* KPI Cards de alertas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" valor={stats.totalDocs || 0} cor="bg-white" textCor="text-torg-dark" />
        <KpiCard label="Válidos" valor={stats.validos || 0} cor="bg-emerald-50" textCor="text-emerald-700"
          onClick={() => setFiltroStatus(filtroStatus === "VALIDO" ? "" : "VALIDO")}
          ativo={filtroStatus === "VALIDO"} />
        <KpiCard label="Vence em 30d" valor={stats.vencendo30 || 0} cor="bg-orange-50" textCor="text-orange-700"
          destaque={stats.vencendo30 > 0}
          onClick={() => setFiltroStatus(filtroStatus === "VENCENDO_30" ? "" : "VENCENDO_30")}
          ativo={filtroStatus === "VENCENDO_30"} />
        <KpiCard label="Vence em 60d" valor={stats.vencendo60 || 0} cor="bg-yellow-50" textCor="text-yellow-700"
          onClick={() => setFiltroStatus(filtroStatus === "VENCENDO_60" ? "" : "VENCENDO_60")}
          ativo={filtroStatus === "VENCENDO_60"} />
        <KpiCard label="Vencidos" valor={stats.vencidos || 0} cor="bg-red-50" textCor="text-red-600"
          destaque={stats.vencidos > 0}
          onClick={() => setFiltroStatus(filtroStatus === "VENCIDO" ? "" : "VENCIDO")}
          ativo={filtroStatus === "VENCIDO"} />
        <KpiCard label="Sem validade" valor={stats.semValidade || 0} cor="bg-gray-50" textCor="text-torg-gray" />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, tipo, nº documento, funcionário…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
          <div className="relative">
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todas categorias</option>
              {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filtroVinculo} onChange={(e) => setFiltroVinculo(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos (Func. + Empresa)</option>
              <option value="FUNCIONARIO">Funcionário</option>
              <option value="EMPRESA">Empresa</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          {(busca || filtroCategoria || filtroStatus || filtroVinculo) && (
            <button onClick={() => { setBusca(""); setFiltroCategoria(""); setFiltroStatus(""); setFiltroVinculo(""); }}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <X size={12} /> Limpar
            </button>
          )}
          <p className="text-xs text-torg-gray ml-auto"><strong>{documentos.length}</strong> documento{documentos.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Tabela */}
      {documentos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum documento encontrado</p>
          <p className="text-xs text-torg-gray mt-2">Cadastre documentos para acompanhar validades e renovações.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vínculo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emissão</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Validade</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {documentos.map((d) => {
                  const st = calcStatus(d.dataValidade);
                  const cat = catMap[d.categoria] || { label: d.categoria, cor: "bg-gray-100 text-gray-700" };
                  const StIcon = st.icon;
                  return (
                    <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${st.key === "VENCIDO" ? "bg-red-50/30" : st.key === "VENCENDO_30" ? "bg-orange-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-torg-dark">{d.nome}</span>
                          <span className="text-[10px] text-torg-gray ml-2">{TIPO_LABEL[d.tipo] || d.tipo}</span>
                        </div>
                        {d.numeroDocumento && <p className="text-[10px] text-torg-gray">Nº {d.numeroDocumento}</p>}
                        {d.orgaoEmissor && <p className="text-[10px] text-torg-gray">{d.orgaoEmissor}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${cat.cor}`}>
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.funcionario ? (
                          <div>
                            <span className="text-torg-dark text-xs font-medium">{d.funcionario.nome}</span>
                            {d.funcionario.setor?.nome && (
                              <p className="text-[10px] text-torg-gray">{d.funcionario.setor.nome}</p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Building2 size={12} /> Empresa
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-torg-gray tabular-nums">{fmtData(d.dataEmissao)}</td>
                      <td className="px-4 py-3 text-xs text-torg-dark font-medium tabular-nums">{fmtData(d.dataValidade)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>
                          {StIcon && <StIcon size={11} />} {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}

      {/* Modal Novo Documento */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && setModalAberto(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Novo Documento</h3>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Categoria e tipo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Categoria *</label>
                  <div className="relative">
                    <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value, tipo: "" })}
                      className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue">
                      {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Tipo</label>
                  <div className="relative">
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                      className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue">
                      <option value="">Selecione…</option>
                      {tiposDisponiveis.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      <option value="OUTRO">Outro</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Nome do documento *</label>
                <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: ASO Periódico 2025, NR-35 Reciclagem, Alvará 2025…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
              </div>

              {/* Vínculo */}
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">
                  Funcionário <span className="text-torg-gray font-normal">(vazio = documento da empresa)</span>
                </label>
                <div className="relative">
                  <select value={form.funcionarioId} onChange={(e) => setForm({ ...form, funcionarioId: e.target.value })}
                    className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue">
                    <option value="">— Documento da Empresa —</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}{f.matricula ? ` (#${f.matricula})` : ""}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
                </div>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Data de emissão</label>
                  <input type="date" value={form.dataEmissao} onChange={(e) => setForm({ ...form, dataEmissao: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Data de validade</label>
                  <input type="date" value={form.dataValidade} onChange={(e) => setForm({ ...form, dataValidade: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
              </div>

              {/* Detalhes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Órgão emissor</label>
                  <input type="text" value={form.orgaoEmissor} onChange={(e) => setForm({ ...form, orgaoEmissor: e.target.value })}
                    placeholder="Clínica, Detran, Prefeitura…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Nº documento / protocolo</label>
                  <input type="text" value={form.numeroDocumento} onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Observação</label>
                <textarea value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModalAberto(false)} disabled={salvando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando || !form.nome || !form.categoria}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {salvando ? "Salvando…" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resultado Importação */}
      {modalImport && importResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalImport(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-torg-blue" />
                <h3 className="text-lg font-bold text-torg-dark">Resultado da importação</h3>
              </div>
              <button onClick={() => setModalImport(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-torg-dark">{importResult.total}</p>
                  <p className="text-[10px] text-torg-gray uppercase tracking-wider mt-1">Total linhas</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-emerald-700">{importResult.criados}</p>
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wider mt-1">Criados</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${importResult.erros > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                  <p className={`text-2xl font-extrabold ${importResult.erros > 0 ? "text-red-600" : "text-torg-gray"}`}>{importResult.erros}</p>
                  <p className={`text-[10px] uppercase tracking-wider mt-1 ${importResult.erros > 0 ? "text-red-500" : "text-torg-gray"}`}>Erros</p>
                </div>
              </div>
              {importResult.detalhes?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-torg-gray uppercase tracking-wider mb-2">Detalhes por linha</p>
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50/60 border-b border-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Linha</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Nome</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importResult.detalhes.map((d, i) => (
                          <tr key={i} className={d.ok ? "" : "bg-red-50/50"}>
                            <td className="px-3 py-1.5 text-torg-gray tabular-nums">{d.linha}</td>
                            <td className="px-3 py-1.5 text-torg-dark font-medium truncate max-w-[180px]">{d.nome || "—"}</td>
                            <td className="px-3 py-1.5">
                              {d.ok ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> Criado</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> {d.erro}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end shrink-0">
              <button onClick={() => setModalImport(false)}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════ COMPLIANCE PANEL ═══════
const STATUS_ICON = {
  OK: { icon: CheckCircle2, cor: "text-emerald-600", bg: "bg-emerald-50", label: "OK" },
  VENCIDO: { icon: ShieldAlert, cor: "text-red-600", bg: "bg-red-50", label: "Vencido" },
  VENCENDO: { icon: AlertTriangle, cor: "text-orange-600", bg: "bg-orange-50", label: "Vence em 30d" },
  AUSENTE: { icon: XCircle, cor: "text-red-600", bg: "bg-red-50", label: "Ausente" },
};

function CompliancePanel({ compliance, carregando, funcionarios, filtro, setFiltro, expandido, toggleExpandido, onRecarregar }) {
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Verificando conformidade…
      </div>
    );
  }

  if (!compliance) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <ClipboardCheck size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-torg-gray text-lg font-medium">Erro ao carregar conformidade</p>
        <button onClick={onRecarregar} className="mt-4 px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue/90">
          Tentar novamente
        </button>
      </div>
    );
  }

  const { resumo, empresa } = compliance;
  const pctCor = (p) => p === 100 ? "text-emerald-600" : p >= 70 ? "text-yellow-600" : "text-red-600";
  const pctBg = (p) => p === 100 ? "bg-emerald-500" : p >= 70 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-6">
      {/* KPI Compliance */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className={`w-3 h-3 rounded-full ${pctBg(resumo.percentualGeral)}`} />
            <span className={`text-3xl font-extrabold ${pctCor(resumo.percentualGeral)}`}>{resumo.percentualGeral}%</span>
          </div>
          <p className="text-[10px] text-torg-gray uppercase tracking-wider">Conformidade geral</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-extrabold text-emerald-700">{resumo.funcionariosConformes}</p>
          <p className="text-[10px] text-emerald-600 uppercase tracking-wider mt-1">Conformes</p>
        </div>
        <div className={`rounded-xl p-4 text-center ${resumo.funcionariosComPendencia > 0 ? "bg-red-50" : "bg-gray-50"}`}>
          <p className={`text-3xl font-extrabold ${resumo.funcionariosComPendencia > 0 ? "text-red-600" : "text-torg-gray"}`}>{resumo.funcionariosComPendencia}</p>
          <p className={`text-[10px] uppercase tracking-wider mt-1 ${resumo.funcionariosComPendencia > 0 ? "text-red-500" : "text-torg-gray"}`}>Com pendências</p>
        </div>
        <div className={`rounded-xl p-4 text-center ${resumo.totalPendencias > 0 ? "bg-orange-50" : "bg-gray-50"}`}>
          <p className={`text-3xl font-extrabold ${resumo.totalPendencias > 0 ? "text-orange-600" : "text-torg-gray"}`}>{resumo.totalPendencias}</p>
          <p className={`text-[10px] uppercase tracking-wider mt-1 ${resumo.totalPendencias > 0 ? "text-orange-500" : "text-torg-gray"}`}>Total pendências</p>
        </div>
        <div className={`rounded-xl p-4 text-center ${resumo.empresa.pendentes > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
          <p className={`text-3xl font-extrabold ${resumo.empresa.pendentes > 0 ? "text-amber-700" : "text-emerald-700"}`}>{resumo.empresa.percentual}%</p>
          <p className={`text-[10px] uppercase tracking-wider mt-1 ${resumo.empresa.pendentes > 0 ? "text-amber-600" : "text-emerald-600"}`}>Empresa</p>
        </div>
      </div>

      {/* Documentos da Empresa */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <Building2 size={18} className="text-amber-600" />
          <h3 className="text-sm font-bold text-torg-dark">Documentos da Empresa (CCT)</h3>
          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
            resumo.empresa.pendentes > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
          }`}>{resumo.empresa.ok}/{resumo.empresa.total} OK</span>
        </div>
        <div className="divide-y divide-gray-50">
          {empresa.map((item) => {
            const st = STATUS_ICON[item.status];
            const StIcon = st.icon;
            return (
              <div key={item.regra.tipo} className={`px-5 py-3 flex items-center gap-3 ${item.status !== "OK" ? st.bg + "/40" : ""}`}>
                <StIcon size={16} className={st.cor} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-torg-dark">{item.regra.nome}</p>
                  <p className="text-[10px] text-torg-gray">
                    {item.regra.referenciaCCT}
                    {item.regra.validadeMeses && <> · Validade: {item.regra.validadeMeses} meses</>}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.cor}`}>
                  {st.label}
                </span>
                {item.documento && (
                  <span className="text-[10px] text-torg-gray hidden sm:block">
                    {item.documento.nome}
                    {item.documento.dataValidade && <> · Val: {new Date(item.documento.dataValidade).toLocaleDateString("pt-BR")}</>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filtros Funcionários */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-bold text-torg-dark flex items-center gap-2">
          <Users size={16} /> Funcionários
        </p>
        <div className="flex gap-1 ml-4">
          {[
            { key: "TODOS", label: "Todos" },
            { key: "PENDENCIAS", label: "Com pendências" },
            { key: "CONFORMES", label: "Conformes" },
          ].map((f) => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filtro === f.key ? "bg-torg-blue text-white" : "bg-gray-100 text-torg-gray hover:bg-gray-200"
              }`}>{f.label}</button>
          ))}
        </div>
        <p className="text-xs text-torg-gray ml-auto">{funcionarios.length} funcionário{funcionarios.length !== 1 ? "s" : ""}</p>
        <button onClick={onRecarregar} className="text-xs text-torg-blue hover:underline">Atualizar</button>
      </div>

      {/* Lista por funcionário */}
      {funcionarios.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <BadgeCheck size={48} className="mx-auto text-emerald-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {filtro === "PENDENCIAS" ? "Nenhum funcionário com pendência!" : "Nenhum funcionário encontrado"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {funcionarios.map((f) => {
            const aberto = expandido[f.funcionario.id];
            const pendentes = f.itens.filter((i) => i.status !== "OK");
            return (
              <div key={f.funcionario.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleExpandido(f.funcionario.id)}
                  className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors text-left">
                  <ChevronRight size={16} className={`text-torg-gray shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-torg-dark">{f.funcionario.nome}</span>
                      {f.funcionario.matricula && <span className="text-[10px] text-torg-gray">#{f.funcionario.matricula}</span>}
                      {f.funcionario.producao && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-700">
                          <Factory size={9} /> Produção
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-torg-gray">{f.funcionario.setor}{f.funcionario.cargo ? ` · ${f.funcionario.cargo}` : ""}</p>
                  </div>
                  {/* Barra de progresso mini */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pctBg(f.percentual)}`} style={{ width: `${f.percentual}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${pctCor(f.percentual)}`}>{f.percentual}%</span>
                  </div>
                  {/* Badges resumo */}
                  <div className="flex items-center gap-1 shrink-0">
                    {f.ausentes > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                        <XCircle size={10} /> {f.ausentes}
                      </span>
                    )}
                    {f.vencidos > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                        <ShieldAlert size={10} /> {f.vencidos}
                      </span>
                    )}
                    {f.vencendo > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                        <AlertTriangle size={10} /> {f.vencendo}
                      </span>
                    )}
                    {f.percentual === 100 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                        <BadgeCheck size={10} /> OK
                      </span>
                    )}
                  </div>
                </button>
                {aberto && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {f.itens.map((item) => {
                      const st = STATUS_ICON[item.status];
                      const StIcon = st.icon;
                      return (
                        <div key={item.regra.tipo} className={`px-5 py-2.5 pl-12 flex items-center gap-3 ${item.status !== "OK" ? st.bg + "/40" : ""}`}>
                          <StIcon size={14} className={st.cor} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-torg-dark">{item.regra.nome}</p>
                            <p className="text-[10px] text-torg-gray">{item.regra.referenciaCCT}</p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.cor}`}>
                            {st.label}
                          </span>
                          {item.documento && item.documento.dataValidade && (
                            <span className="text-[10px] text-torg-gray tabular-nums hidden sm:block">
                              Val: {new Date(item.documento.dataValidade).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
        <p className="text-[10px] font-bold text-torg-gray uppercase tracking-wider mb-2">Referência: CCT SINDIMAQ/SINAEES 2025–2027</p>
        <div className="flex flex-wrap gap-4 text-[10px] text-torg-gray">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-600" /> Documento dentro da validade</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle size={10} className="text-orange-600" /> Vence nos próximos 30 dias</span>
          <span className="inline-flex items-center gap-1"><ShieldAlert size={10} className="text-red-600" /> Documento vencido</span>
          <span className="inline-flex items-center gap-1"><XCircle size={10} className="text-red-600" /> Documento ausente</span>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, valor, cor, textCor, destaque, onClick, ativo }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`rounded-xl p-3 text-center transition-all ${cor} ${ativo ? "ring-2 ring-torg-blue shadow-md" : ""} ${onClick ? "cursor-pointer hover:shadow-md" : ""} ${destaque ? "animate-pulse-subtle" : ""}`}>
      <p className={`text-2xl font-extrabold ${textCor}`}>{valor}</p>
      <p className="text-[10px] text-torg-gray uppercase tracking-wider mt-1">{label}</p>
    </button>
  );
}
