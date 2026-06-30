"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Users, Search, PlusCircle, Loader2, AlertCircle, X,
  ChevronDown, Edit, UserX, UserCheck, Download, Upload,
  FileSpreadsheet, CheckCircle2, XCircle, UserMinus, MoreVertical,
  ArrowUpDown, ArrowRightLeft, DollarSign, Pencil,
} from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

const STATUS_LABELS = {
  ATIVO: { label: "Ativo", cor: "bg-emerald-100 text-emerald-800" },
  AFASTADO: { label: "Afastado", cor: "bg-amber-100 text-amber-800" },
  FERIAS: { label: "Férias", cor: "bg-blue-100 text-blue-800" },
  DEMITIDO: { label: "Demitido", cor: "bg-red-100 text-red-800" },
};

const CONTRATO_LABELS = {
  CLT: "CLT", PJ: "PJ", ESTAGIO: "Estágio",
  JOVEM_APRENDIZ: "Jovem Aprendiz", TEMPORARIO: "Temporário",
};

const NIVEIS = [
  { value: "OPERACIONAL", label: "Operacional" },
  { value: "TECNICO", label: "Técnico" },
  { value: "SUPERVISAO", label: "Supervisão" },
  { value: "GERENCIA", label: "Gerência" },
  { value: "DIRETORIA", label: "Diretoria" },
];

export default function FuncionariosClient() {
  const [funcionarios, setFuncionarios] = useState([]);
  const [setores, setSetores] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null); // null = novo; id = editando
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({});

  // Desligamento
  const [modalDesligamento, setModalDesligamento] = useState(null); // funcionario selecionado
  const [desligando, setDesligando] = useState(false);
  const [formDeslig, setFormDeslig] = useState({
    dataDemissao: new Date().toISOString().split("T")[0],
    tipoDesligamento: "VOLUNTARIO",
    categoriaDesligamento: "",
    motivoDesligamento: "",
  });

  // Ajuste (promoção / transferência / salário)
  const [modalAjuste, setModalAjuste] = useState(null); // funcionário selecionado
  const [ajustando, setAjustando] = useState(false);
  const [formAjuste, setFormAjuste] = useState({
    tipo: "PROMOCAO",
    cargoId: "",
    setorId: "",
    salario: "",
    dataEfetivacao: new Date().toISOString().split("T")[0],
    motivo: "",
  });

  // Menu de ações por funcionário
  const [menuAberto, setMenuAberto] = useState(null);

  // Import Excel
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Carregar dados
  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const [fRes, sRes, cRes] = await Promise.all([
        fetch("/api/rh/funcionarios").then((r) => r.json()),
        fetch("/api/rh/setores").then((r) => r.json()),
        fetch("/api/rh/cargos").then((r) => r.json()),
      ]);
      if (!fRes.success) throw new Error(fRes.error);
      setFuncionarios(fRes.data || []);
      setSetores(sRes.data || []);
      setCargos(cRes.data || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // Filtros
  const filtrados = useMemo(() => {
    return funcionarios.filter((f) => {
      if (filtroSetor && f.setor?.id !== filtroSetor) return false;
      if (filtroStatus && f.status !== filtroStatus) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hay = `${f.nome} ${f.cpf || ""} ${f.matricula || ""} ${f.email || ""} ${f.cargo?.nome || ""} ${f.setor?.nome || ""}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [funcionarios, busca, filtroSetor, filtroStatus]);

  // Abrir modal novo
  const abrirNovo = () => {
    setEditandoId(null);
    setErro("");
    setForm({
      nome: "", cpf: "", pis: "", rg: "", dataNascimento: "", email: "", telefone: "",
      endereco: "", cidadeUF: "", matricula: "", empresa: "", dataAdmissao: "",
      setorId: setores[0]?.id || "", cargoId: cargos[0]?.id || "",
      salario: "", tipoContrato: "CLT", jornadaHoras: 44, turno: "", observacao: "",
      banco: "", agencia: "", conta: "", pixChave: "",
    });
    setModalAberto(true);
  };

  // Abrir modal de edição — busca o detalhe completo (a lista não traz todos os campos)
  // e formata as datas como YYYY-MM-DD (exigência do input type="date"; sem isso o
  // campo fica vazio e o botão Salvar trava).
  const soData = (d) => (d ? String(d).slice(0, 10) : "");
  const abrirEditar = async (func) => {
    setMenuAberto(null);
    setEditandoId(func.id);
    setErro("");
    setForm({
      nome: func.nome || "", cpf: func.cpf || "", pis: func.pis || "", rg: "", dataNascimento: "", email: func.email || "",
      telefone: func.telefone || "", endereco: "", cidadeUF: "", matricula: func.matricula || "", empresa: func.empresa || "",
      dataAdmissao: soData(func.dataAdmissao), setorId: func.setor?.id || "", cargoId: func.cargo?.id || "",
      salario: func.salario ?? "", tipoContrato: func.tipoContrato || "CLT", jornadaHoras: 44, turno: "", observacao: "",
      banco: "", agencia: "", conta: "", pixChave: "",
    });
    setModalAberto(true);
    try {
      const res = await fetch(`/api/rh/funcionarios/${func.id}`);
      const j = await res.json();
      if (res.ok && j.success) {
        const f = j.data;
        setForm({
          nome: f.nome || "", cpf: f.cpf || "", pis: f.pis || "", rg: f.rg || "", dataNascimento: soData(f.dataNascimento),
          email: f.email || "", telefone: f.telefone || "", endereco: f.endereco || "", cidadeUF: f.cidadeUF || "",
          matricula: f.matricula || "", empresa: f.empresa || "", dataAdmissao: soData(f.dataAdmissao), setorId: f.setor?.id || "", cargoId: f.cargo?.id || "",
          salario: f.salario ?? "", tipoContrato: f.tipoContrato || "CLT", jornadaHoras: f.jornadaHoras || 44,
          turno: f.turno || "", observacao: f.observacao || "",
          banco: f.banco || "", agencia: f.agencia || "", conta: f.conta || "", pixChave: f.pixChave || "",
        });
      }
    } catch { /* mantém o preenchimento parcial da linha */ }
  };

  // Salvar
  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      const body = {
        ...form,
        salario: form.salario ? Number(form.salario) : null,
        jornadaHoras: Number(form.jornadaHoras) || 44,
        cpf: form.cpf || null,
        pis: form.pis || null,
        empresa: form.empresa || null,
        banco: form.banco || null,
        agencia: form.agencia || null,
        conta: form.conta || null,
        pixChave: form.pixChave || null,
        rg: form.rg || null,
        dataNascimento: form.dataNascimento || null,
        email: form.email || null,
        telefone: form.telefone || null,
        endereco: form.endereco || null,
        cidadeUF: form.cidadeUF || null,
        matricula: form.matricula || null,
        turno: form.turno || null,
        observacao: form.observacao || null,
      };
      const res = await fetch(
        editandoId ? `/api/rh/funcionarios/${editandoId}` : "/api/rh/funcionarios",
        { method: editandoId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");

      const enriquecido = {
        ...data.data,
        setor: setores.find((s) => s.id === form.setorId) || data.data.setor || null,
        cargo: cargos.find((c) => c.id === form.cargoId) || data.data.cargo || null,
      };
      setFuncionarios((prev) => editandoId
        ? prev.map((f) => (f.id === editandoId ? { ...f, ...enriquecido } : f))
        : [...prev, enriquecido]);
      setModalAberto(false);
      setEditandoId(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // Baixar modelo Excel
  const baixarModelo = async () => {
    try {
      const res = await fetch("/api/rh/funcionarios/template");
      if (!res.ok) throw new Error("Erro ao gerar modelo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo-funcionarios-torg.xlsx";
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
      const res = await fetch("/api/rh/funcionarios/importar", { method: "POST", body: fd });
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

  // Desligar funcionário
  const handleDesligar = async () => {
    setDesligando(true);
    setErro("");
    try {
      const res = await fetch(`/api/rh/funcionarios/${modalDesligamento.id}/desligar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formDeslig),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao desligar funcionário");
      // Atualizar lista local
      setFuncionarios((prev) =>
        prev.map((f) =>
          f.id === modalDesligamento.id
            ? { ...f, status: "DEMITIDO", ativo: false, dataDemissao: formDeslig.dataDemissao }
            : f
        )
      );
      setModalDesligamento(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setDesligando(false);
    }
  };

  const abrirDesligamento = (func) => {
    setMenuAberto(null);
    setFormDeslig({
      dataDemissao: new Date().toISOString().split("T")[0],
      tipoDesligamento: "VOLUNTARIO",
      categoriaDesligamento: "",
      motivoDesligamento: "",
    });
    setModalDesligamento(func);
  };

  // Ajuste
  const abrirAjuste = (func) => {
    setMenuAberto(null);
    setFormAjuste({
      tipo: "PROMOCAO",
      cargoId: func.cargo?.id || "",
      setorId: func.setor?.id || "",
      salario: func.salario ? Number(func.salario) : "",
      dataEfetivacao: new Date().toISOString().split("T")[0],
      motivo: "",
    });
    setModalAjuste(func);
  };

  const handleAjuste = async () => {
    setAjustando(true);
    setErro("");
    try {
      const body = {
        tipo: formAjuste.tipo,
        dataEfetivacao: formAjuste.dataEfetivacao,
        motivo: formAjuste.motivo || null,
      };
      // Só enviar campos que mudaram
      if (formAjuste.cargoId && formAjuste.cargoId !== modalAjuste.cargo?.id) body.cargoId = formAjuste.cargoId;
      if (formAjuste.setorId && formAjuste.setorId !== modalAjuste.setor?.id) body.setorId = formAjuste.setorId;
      if (formAjuste.salario !== "" && Number(formAjuste.salario) !== (modalAjuste.salario ? Number(modalAjuste.salario) : null)) {
        body.salario = Number(formAjuste.salario);
      }

      const res = await fetch(`/api/rh/funcionarios/${modalAjuste.id}/ajuste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar ajuste");

      // Update otimista
      setFuncionarios((prev) =>
        prev.map((f) =>
          f.id === modalAjuste.id
            ? {
                ...f,
                cargo: data.data.cargo || f.cargo,
                setor: data.data.setor || f.setor,
                salario: data.data.salario ?? f.salario,
                cargoId: data.data.cargoId || f.cargoId,
                setorId: data.data.setorId || f.setorId,
              }
            : f
        )
      );
      setModalAjuste(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setAjustando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando funcionários…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Funcionários</h2>
          <p className="text-sm text-torg-gray mt-1">{funcionarios.length} cadastrados</p>
        </div>
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
          <BotaoAcoes
            onNovo={abrirNovo}
            desabilitado={setores.length === 0 || cargos.length === 0}
          />
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      {/* Aviso se falta setor/cargo */}
      {(setores.length === 0 || cargos.length === 0) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          Antes de cadastrar funcionários, cadastre pelo menos um{" "}
          {setores.length === 0 && <strong>Setor</strong>}
          {setores.length === 0 && cargos.length === 0 && " e um "}
          {cargos.length === 0 && <strong>Cargo</strong>}
          .
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input
              type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF, matrícula, cargo…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
            />
          </div>
          <div className="relative">
            <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos os setores</option>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          <div className="relative">
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>
          {(busca || filtroSetor || filtroStatus) && (
            <button onClick={() => { setBusca(""); setFiltroSetor(""); setFiltroStatus(""); }}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <X size={12} /> Limpar
            </button>
          )}
          <p className="text-xs text-torg-gray ml-auto"><strong>{filtrados.length}</strong> encontrado{filtrados.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {funcionarios.length === 0 ? "Nenhum funcionário cadastrado" : "Nenhum resultado"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cargo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Setor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contrato</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Admissão</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Salário</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((f) => {
                  const st = STATUS_LABELS[f.status] || { label: f.status, cor: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium text-torg-dark">{f.nome}</span>
                          {f.matricula && <span className="text-[10px] text-torg-gray ml-2">#{f.matricula}</span>}
                        </div>
                        {f.email && <p className="text-[10px] text-torg-gray">{f.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-torg-dark">{f.cargo?.nome || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-torg-blue/10 text-torg-blue font-medium">
                          {f.setor?.sigla || f.setor?.nome || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-torg-gray">{CONTRATO_LABELS[f.tipoContrato] || f.tipoContrato}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cor}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-torg-gray tabular-nums">{fmtData(f.dataAdmissao)}</td>
                      <td className="px-4 py-3 text-right font-medium text-torg-dark tabular-nums">{fmtMoeda(f.salario)}</td>
                      <td className="px-3 py-3 text-center">
                        {f.status !== "DEMITIDO" && (
                          <div className="relative">
                            <button
                              onClick={() => setMenuAberto(menuAberto === f.id ? null : f.id)}
                              className="p-1.5 text-gray-400 hover:text-torg-dark hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical size={14} />
                            </button>
                            {menuAberto === f.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuAberto(null)} />
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                                  <button
                                    onClick={() => abrirEditar(f)}
                                    className="w-full px-3 py-2 text-sm text-left text-torg-dark hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <Pencil size={14} className="text-torg-blue" />
                                    Editar cadastro
                                  </button>
                                  <button
                                    onClick={() => abrirAjuste(f)}
                                    className="w-full px-3 py-2 text-sm text-left text-torg-dark hover:bg-gray-50 flex items-center gap-2"
                                  >
                                    <ArrowUpDown size={14} className="text-torg-blue" />
                                    Ajuste / Movimentação
                                  </button>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button
                                    onClick={() => abrirDesligamento(f)}
                                    className="w-full px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                                  >
                                    <UserMinus size={14} />
                                    Desligamento
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
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

      {/* Modal Novo Funcionário */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && setModalAberto(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">{editandoId ? "Editar funcionário" : "Novo Funcionário"}</h3>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Dados pessoais */}
              <p className="text-xs font-bold text-torg-gray uppercase tracking-wider">Dados Pessoais</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo label="Nome completo *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                <Campo label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} placeholder="000.000.000-00" />
                <Campo label="PIS/PASEP" value={form.pis} onChange={(v) => setForm({ ...form, pis: v })} placeholder="Usado no Controle de Ponto" />
                <Campo label="RG" value={form.rg} onChange={(v) => setForm({ ...form, rg: v })} />
                <Campo label="Data de nascimento" type="date" value={form.dataNascimento} onChange={(v) => setForm({ ...form, dataNascimento: v })} />
                <Campo label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <Campo label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
                <Campo label="Endereço" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} className="sm:col-span-2" />
                <Campo label="Cidade/UF" value={form.cidadeUF} onChange={(v) => setForm({ ...form, cidadeUF: v })} />
              </div>

              {/* Vínculo */}
              <p className="text-xs font-bold text-torg-gray uppercase tracking-wider pt-2">Vínculo Empregatício</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo label="Matrícula" value={form.matricula} onChange={(v) => setForm({ ...form, matricula: v })} />
                <Campo label="Empresa empregadora" value={form.empresa} onChange={(v) => setForm({ ...form, empresa: v })} placeholder="Ex: TORG Metal, VMI" />
                <Campo label="Data de admissão *" type="date" value={form.dataAdmissao} onChange={(v) => setForm({ ...form, dataAdmissao: v })} />
                <Select label="Setor *" value={form.setorId} onChange={(v) => setForm({ ...form, setorId: v })}
                  options={setores.map((s) => ({ value: s.id, label: s.nome }))} />
                <Select label="Cargo *" value={form.cargoId} onChange={(v) => setForm({ ...form, cargoId: v })}
                  options={cargos.map((c) => ({ value: c.id, label: c.nome }))} />
                <Campo label="Salário (R$)" type="number" value={form.salario} onChange={(v) => setForm({ ...form, salario: v })} />
                <Select label="Tipo de contrato" value={form.tipoContrato} onChange={(v) => setForm({ ...form, tipoContrato: v })}
                  options={Object.entries(CONTRATO_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
                <Campo label="Jornada (h/sem)" type="number" value={form.jornadaHoras} onChange={(v) => setForm({ ...form, jornadaHoras: v })} />
                <Select label="Turno" value={form.turno || ""} onChange={(v) => setForm({ ...form, turno: v })}
                  options={[
                    { value: "", label: "—" },
                    { value: "ADMINISTRATIVO", label: "Administrativo" },
                    { value: "PRODUCAO_1", label: "Produção 1º turno" },
                    { value: "PRODUCAO_2", label: "Produção 2º turno" },
                    { value: "NOTURNO", label: "Noturno" },
                  ]} />
              </div>

              {/* Dados bancários */}
              <p className="text-xs font-bold text-torg-gray uppercase tracking-wider pt-2">Dados Bancários</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Campo label="Banco" value={form.banco} onChange={(v) => setForm({ ...form, banco: v })} />
                <Campo label="Agência" value={form.agencia} onChange={(v) => setForm({ ...form, agencia: v })} />
                <Campo label="Conta" value={form.conta} onChange={(v) => setForm({ ...form, conta: v })} />
                <Campo label="Chave PIX" value={form.pixChave} onChange={(v) => setForm({ ...form, pixChave: v })} placeholder="CPF, e-mail, telefone…" />
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Observação</label>
                <textarea value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModalAberto(false)} disabled={salvando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando || !form.nome || !form.dataAdmissao || !form.setorId || !form.cargoId}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : editandoId ? <Pencil size={14} /> : <PlusCircle size={14} />}
                {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Desligamento */}
      {modalDesligamento && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !desligando && setModalDesligamento(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <UserMinus size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-torg-dark">Desligar Funcionário</h3>
                  <p className="text-sm text-torg-gray">{modalDesligamento.nome}</p>
                </div>
              </div>
              <button onClick={() => setModalDesligamento(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Data de desligamento *" type="date" value={formDeslig.dataDemissao}
                  onChange={(v) => setFormDeslig({ ...formDeslig, dataDemissao: v })} />
                <Select label="Tipo *" value={formDeslig.tipoDesligamento}
                  onChange={(v) => setFormDeslig({ ...formDeslig, tipoDesligamento: v })}
                  options={[
                    { value: "VOLUNTARIO", label: "Voluntário (pediu demissão)" },
                    { value: "INVOLUNTARIO", label: "Involuntário (demitido s/ justa causa)" },
                    { value: "JUSTA_CAUSA", label: "Justa Causa" },
                    { value: "TERMINO_CONTRATO", label: "Término de Contrato" },
                  ]} />
              </div>
              <Select label="Categoria/Motivo principal" value={formDeslig.categoriaDesligamento}
                onChange={(v) => setFormDeslig({ ...formDeslig, categoriaDesligamento: v })}
                options={[
                  { value: "", label: "— Selecione (opcional) —" },
                  { value: "OUTRO_EMPREGO", label: "Outro emprego / proposta melhor" },
                  { value: "INSATISFACAO", label: "Insatisfação / clima" },
                  { value: "CORTE", label: "Corte / reestruturação" },
                  { value: "DESEMPENHO", label: "Desempenho insuficiente" },
                  { value: "DISCIPLINAR", label: "Questão disciplinar" },
                  { value: "ACORDO", label: "Acordo mútuo" },
                  { value: "OUTROS", label: "Outros" },
                ]} />
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Observações do desligamento</label>
                <textarea value={formDeslig.motivoDesligamento} onChange={(e) => setFormDeslig({ ...formDeslig, motivoDesligamento: e.target.value })}
                  rows={3} placeholder="Detalhes adicionais sobre o desligamento…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Ao confirmar, o funcionário será marcado como <strong>Demitido</strong> e ficará inativo.
                  Esta ação pode ser revertida manualmente se necessário.
                </span>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModalDesligamento(null)} disabled={desligando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleDesligar} disabled={desligando || !formDeslig.dataDemissao}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 inline-flex items-center gap-2 disabled:opacity-50">
                {desligando ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
                {desligando ? "Processando…" : "Confirmar Desligamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajuste */}
      {modalAjuste && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !ajustando && setModalAjuste(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-torg-blue/10 flex items-center justify-center">
                  <ArrowUpDown size={20} className="text-torg-blue" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-torg-dark">Ajuste / Movimentação</h3>
                  <p className="text-sm text-torg-gray">{modalAjuste.nome}</p>
                </div>
              </div>
              <button onClick={() => setModalAjuste(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <Select label="Tipo de ajuste *" value={formAjuste.tipo}
                onChange={(v) => setFormAjuste({ ...formAjuste, tipo: v })}
                options={[
                  { value: "PROMOCAO", label: "Promoção" },
                  { value: "TRANSFERENCIA", label: "Transferência de setor" },
                  { value: "ALTERACAO_SALARIAL", label: "Alteração salarial" },
                  { value: "CORRECAO", label: "Correção de cadastro" },
                ]} />

              <Campo label="Data de efetivação *" type="date" value={formAjuste.dataEfetivacao}
                onChange={(v) => setFormAjuste({ ...formAjuste, dataEfetivacao: v })} />

              {/* Campos condicionais por tipo */}
              {(formAjuste.tipo === "PROMOCAO" || formAjuste.tipo === "CORRECAO") && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-bold text-torg-gray uppercase tracking-wider flex items-center gap-2">
                    <Pencil size={12} /> Novo cargo
                  </p>
                  <Select label="Cargo" value={formAjuste.cargoId}
                    onChange={(v) => setFormAjuste({ ...formAjuste, cargoId: v })}
                    options={cargos.map((c) => ({ value: c.id, label: c.nome }))} />
                  <div className="flex items-center gap-2 text-xs text-torg-gray">
                    <span>Atual:</span>
                    <span className="font-medium text-torg-dark">{modalAjuste.cargo?.nome || "—"}</span>
                  </div>
                </div>
              )}

              {(formAjuste.tipo === "TRANSFERENCIA" || formAjuste.tipo === "CORRECAO") && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-bold text-torg-gray uppercase tracking-wider flex items-center gap-2">
                    <ArrowRightLeft size={12} /> Novo setor
                  </p>
                  <Select label="Setor" value={formAjuste.setorId}
                    onChange={(v) => setFormAjuste({ ...formAjuste, setorId: v })}
                    options={setores.map((s) => ({ value: s.id, label: s.nome }))} />
                  <div className="flex items-center gap-2 text-xs text-torg-gray">
                    <span>Atual:</span>
                    <span className="font-medium text-torg-dark">{modalAjuste.setor?.nome || "—"}</span>
                  </div>
                </div>
              )}

              {(formAjuste.tipo === "ALTERACAO_SALARIAL" || formAjuste.tipo === "PROMOCAO" || formAjuste.tipo === "CORRECAO") && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-bold text-torg-gray uppercase tracking-wider flex items-center gap-2">
                    <DollarSign size={12} /> Salário
                  </p>
                  <Campo label="Novo salário (R$)" type="number" value={formAjuste.salario}
                    onChange={(v) => setFormAjuste({ ...formAjuste, salario: v })} />
                  <div className="flex items-center gap-2 text-xs text-torg-gray">
                    <span>Atual:</span>
                    <span className="font-medium text-torg-dark">{fmtMoeda(modalAjuste.salario)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Motivo / justificativa</label>
                <textarea value={formAjuste.motivo || ""} onChange={(e) => setFormAjuste({ ...formAjuste, motivo: e.target.value })}
                  rows={2} placeholder="Ex: Promoção por mérito, reestruturação de equipe…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-800 flex items-start gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  O ajuste será registrado no histórico (AuditLog) com antes/depois e atualizado automaticamente no organograma.
                </span>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setModalAjuste(null)} disabled={ajustando}
                className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleAjuste} disabled={ajustando || !formAjuste.dataEfetivacao}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
                {ajustando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {ajustando ? "Salvando…" : "Confirmar Ajuste"}
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
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-blue-700">{(importResult.setoresCriados || 0) + (importResult.cargosCriados || 0)}</p>
                  <p className="text-[10px] text-blue-500 uppercase tracking-wider mt-1">Novos set/carg</p>
                </div>
              </div>

              {/* Info extras */}
              {(importResult.setoresCriados > 0 || importResult.cargosCriados > 0) && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
                  {importResult.setoresCriados > 0 && <span>{importResult.setoresCriados} setor{importResult.setoresCriados !== 1 ? "es" : ""} criado{importResult.setoresCriados !== 1 ? "s" : ""}. </span>}
                  {importResult.cargosCriados > 0 && <span>{importResult.cargosCriados} cargo{importResult.cargosCriados !== 1 ? "s" : ""} criado{importResult.cargosCriados !== 1 ? "s" : ""}.</span>}
                </div>
              )}

              {/* Detalhes por linha */}
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

function BotaoAcoes({ onNovo, desabilitado }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2"
      >
        <PlusCircle size={16} />
        Funcionário
        <ChevronDown size={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
            <button
              onClick={() => { setAberto(false); onNovo(); }}
              disabled={desabilitado}
              className="w-full px-3 py-2.5 text-sm text-left text-torg-dark hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
            >
              <PlusCircle size={15} className="text-emerald-600" />
              Novo Funcionário
            </button>
            <div className="border-t border-gray-100 my-1" />
            <p className="px-3 py-1 text-[10px] text-torg-gray uppercase tracking-wider font-bold">Ações por funcionário</p>
            <div className="px-3 py-2 text-xs text-torg-gray flex items-center gap-2">
              <ArrowUpDown size={13} className="text-torg-blue" />
              Ajuste — use o menu <MoreVertical size={11} className="inline" /> na tabela
            </div>
            <div className="px-3 py-2 text-xs text-torg-gray flex items-center gap-2">
              <UserMinus size={13} className="text-red-500" />
              Desligamento — use o menu <MoreVertical size={11} className="inline" /> na tabela
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", placeholder, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-torg-gray mb-1">{label}</label>
      <div className="relative">
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
      </div>
    </div>
  );
}
