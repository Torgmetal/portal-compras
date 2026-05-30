"use client";
import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, Loader2, X, Edit3, Check, Truck, MapPin,
  Send, Search, Paperclip, ExternalLink, CheckCircle2, Clock,
  XCircle, Upload,
} from "lucide-react";

const TIPOS_VEICULO = [
  { value: "TRUCK", label: "Truck" },
  { value: "CARRETA", label: "Carreta" },
  { value: "BITREM", label: "Bitrem" },
  { value: "RODOTREM", label: "Rodotrem" },
  { value: "MUNCK", label: "Munck" },
  { value: "PRANCHA", label: "Prancha" },
  { value: "OUTRO", label: "Outro" },
];

const VEICULO_LABEL = Object.fromEntries(TIPOS_VEICULO.map((v) => [v.value, v.label]));

const STATUS_COTACAO = {
  PENDENTE: { label: "Pendente", cor: "bg-amber-100 text-amber-700", icon: Clock },
  RECEBIDA: { label: "Recebida", cor: "bg-blue-100 text-blue-700", icon: Paperclip },
  SELECIONADA: { label: "Selecionada", cor: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  RECUSADA: { label: "Recusada", cor: "bg-gray-100 text-gray-500", icon: XCircle },
};

function fmtNum(v, dec = 0) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Modal para adicionar frete ──
function NovoFreteModal({ onClose, onSalvar, obraDefault }) {
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("Contagem/MG");
  const [destino, setDestino] = useState(obraDefault || "");
  const [distanciaKm, setDistanciaKm] = useState("");
  const [pesoTon, setPesoTon] = useState("");
  const [pesoPorCarga, setPesoPorCarga] = useState("");
  const [tipoVeiculo, setTipoVeiculo] = useState("CARRETA");
  const [quantidadeViagens, setQuantidadeViagens] = useState("1");
  const [custoPorViagem, setCustoPorViagem] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const pesoTotalNum = parseFloat(pesoTon) || 0;
  const pesoCargaNum = parseFloat(pesoPorCarga) || 0;
  const viagensAuto = pesoCargaNum > 0 && pesoTotalNum > 0
    ? Math.ceil(pesoTotalNum / pesoCargaNum) : null;
  const viagensEfetivas = viagensAuto ?? (parseInt(quantidadeViagens) || 1);
  const custoTotal = viagensEfetivas * (parseFloat(custoPorViagem) || 0);

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao e obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        descricao: descricao.trim(),
        origem: origem.trim() || undefined,
        destino: destino.trim() || undefined,
        distanciaKm: distanciaKm ? parseFloat(distanciaKm) : 0,
        pesoTon: pesoTotalNum,
        pesoPorCarga: pesoCargaNum || undefined,
        tipoVeiculo: tipoVeiculo || undefined,
        quantidadeViagens: viagensEfetivas,
        custoPorViagem: custoPorViagem ? parseFloat(custoPorViagem) : 0,
        custoTotal,
        observacao: observacao.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Novo Frete</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Descricao <span className="text-red-400">*</span></label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Frete estruturas metalicas..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1"><MapPin size={13} className="inline mr-1" />Origem</label>
              <input type="text" value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Contagem/MG" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1"><MapPin size={13} className="inline mr-1" />Destino (Obra)</label>
              <input type="text" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Macae/RJ" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Tipo Veiculo</label>
              <select value={tipoVeiculo} onChange={(e) => setTipoVeiculo(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                {TIPOS_VEICULO.map((v) => (<option key={v.value} value={v.value}>{v.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Distancia (km)</label>
              <input type="number" value={distanciaKm} onChange={(e) => setDistanciaKm(e.target.value)} placeholder="0" min="0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Peso Total (ton)</label>
              <input type="number" value={pesoTon} onChange={(e) => setPesoTon(e.target.value)} placeholder="0" min="0" step="0.01" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Peso/Carga (ton)</label>
              <input type="number" value={pesoPorCarga} onChange={(e) => setPesoPorCarga(e.target.value)} placeholder="Ex: 25" min="0" step="0.01" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Qtd Viagens</label>
              {viagensAuto !== null ? (
                <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold text-torg-blue">
                  {viagensAuto} <span className="text-xs font-normal text-blue-400">(auto)</span>
                </div>
              ) : (
                <input type="number" value={quantidadeViagens} onChange={(e) => setQuantidadeViagens(e.target.value)} placeholder="1" min="1" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Custo/Viagem (R$)</label>
              <input type="number" value={custoPorViagem} onChange={(e) => setCustoPorViagem(e.target.value)} placeholder="0,00" min="0" step="0.01" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Custo Total</label>
              <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-torg-dark">{fmtMoeda(custoTotal)}</div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Observacao</label>
            <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando || !descricao.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal para solicitar cotacao de frete ──
function SolicitarCotacaoModal({ onClose, onEnviar, estudoId }) {
  const [busca, setBusca] = useState("");
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
  const [observacao, setObservacao] = useState("");
  const [prazoResposta, setPrazoResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const timeoutRef = useRef(null);

  const buscarFornecedores = async (termo) => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ busca: termo });
      const res = await fetch(`/api/fornecedores?${params}`);
      const json = await res.json();
      if (json.success) setFornecedores(json.data || []);
    } catch {} finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    buscarFornecedores("");
  }, []);

  const handleBusca = (valor) => {
    setBusca(valor);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => buscarFornecedores(valor), 300);
  };

  const toggleFornecedor = (f) => {
    setSelecionados((prev) => {
      const existe = prev.find((s) => s.id === f.id);
      if (existe) return prev.filter((s) => s.id !== f.id);
      return [...prev, { id: f.id, nome: f.nomeFantasia || f.razaoSocial, email: f.email }];
    });
  };

  const handleEnviar = async () => {
    if (selecionados.length === 0) return setErro("Selecione ao menos uma transportadora");
    setEnviando(true);
    setErro("");
    try {
      await onEnviar({ fornecedores: selecionados, observacao: observacao.trim() || undefined, prazoResposta: prazoResposta.trim() || undefined });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // Filtrar transportadoras com categoria TRANSPORTE primeiro, depois todas
  const transportadoras = fornecedores.filter((f) => f.categorias?.includes("TRANSPORTE"));
  const outros = fornecedores.filter((f) => !f.categorias?.includes("TRANSPORTE"));
  const listaExibida = busca ? fornecedores : [...transportadoras, ...outros];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-torg-dark">Solicitar Cotacao de Frete</h2>
            <p className="text-sm text-torg-gray mt-0.5">Selecione as transportadoras do Vendor List</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => handleBusca(e.target.value)}
              placeholder="Buscar transportadora por nome, CNPJ, cidade..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              autoFocus
            />
          </div>
          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selecionados.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 bg-torg-blue/10 text-torg-blue rounded-lg text-xs font-medium">
                  {s.nome}
                  <button onClick={() => toggleFornecedor(s)} className="hover:text-red-500"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          {carregando ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-torg-blue" />
            </div>
          ) : listaExibida.length === 0 ? (
            <p className="text-sm text-torg-gray text-center py-8">Nenhum fornecedor encontrado</p>
          ) : (
            <div className="space-y-1">
              {!busca && transportadoras.length > 0 && (
                <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide pt-2 pb-1">Transportadoras</p>
              )}
              {listaExibida.map((f) => {
                const marcado = selecionados.some((s) => s.id === f.id);
                const isTransp = f.categorias?.includes("TRANSPORTE");
                return (
                  <button
                    key={f.id}
                    onClick={() => f.email ? toggleFornecedor(f) : null}
                    disabled={!f.email}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      marcado ? "bg-torg-blue/10 border border-torg-blue/30" : "hover:bg-gray-50 border border-transparent"
                    } ${!f.email ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      marcado ? "bg-torg-blue border-torg-blue" : "border-gray-300"
                    }`}>
                      {marcado && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-torg-dark truncate">{f.nomeFantasia || f.razaoSocial}</span>
                        {isTransp && <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">TRANSPORTE</span>}
                      </div>
                      <span className="text-xs text-torg-gray">{f.email || "sem email"}{f.cidade ? ` — ${f.cidade}/${f.uf}` : ""}</span>
                    </div>
                  </button>
                );
              })}
              {!busca && outros.length > 0 && transportadoras.length > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">Outros Fornecedores</p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-torg-dark mb-1">Prazo para resposta</label>
              <input type="text" value={prazoResposta} onChange={(e) => setPrazoResposta(e.target.value)} placeholder="Ex: 3 dias uteis" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-torg-blue/30 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-torg-dark mb-1">Observacao</label>
              <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-torg-blue/30 outline-none" />
            </div>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm text-torg-gray">
              <strong className="text-torg-dark">{selecionados.length}</strong> transportadora{selecionados.length !== 1 ? "s" : ""} selecionada{selecionados.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
              <button
                onClick={handleEnviar}
                disabled={enviando || selecionados.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {enviando ? "Enviando..." : "Enviar Cotacao"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──
export default function AbaFretes({ estudo, estudoId }) {
  const [itens, setItens] = useState(estudo.itensFretes || []);
  const [cotacoes, setCotacoes] = useState(estudo.cotacoesFretes || []);
  const [showModal, setShowModal] = useState(false);
  const [showCotacaoModal, setShowCotacaoModal] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [toast, setToast] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const fileRef = useRef(null);
  const [cotacaoEditId, setCotacaoEditId] = useState(null);
  const [cotacaoEditValor, setCotacaoEditValor] = useState("");
  const [cotacaoEditPrazo, setCotacaoEditPrazo] = useState("");

  const obraDefault = estudo.orcamento?.obra || "";

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── FRETE: Adicionar ──
  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
  };

  // ── FRETE: Excluir ──
  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((i) => i.id !== itemId));
      showToast("Frete removido");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // ── FRETE: Editar inline ──
  const startEdit = (item) => {
    setEditandoId(item.id);
    setEditValores({
      descricao: item.descricao, origem: item.origem || "", destino: item.destino || "",
      distanciaKm: item.distanciaKm || 0, pesoTon: item.pesoTon || 0,
      pesoPorCarga: item.pesoPorCarga || "", tipoVeiculo: item.tipoVeiculo || "CARRETA",
      quantidadeViagens: item.quantidadeViagens || 1, custoPorViagem: item.custoPorViagem || 0,
      observacao: item.observacao || "",
    });
  };
  const cancelEdit = () => { setEditandoId(null); setEditValores({}); };
  const saveEdit = async () => {
    const pesoT = editValores.pesoTon || 0;
    const pesoC = parseFloat(editValores.pesoPorCarga) || 0;
    const viagensCalc = pesoC > 0 && pesoT > 0 ? Math.ceil(pesoT / pesoC) : (editValores.quantidadeViagens || 1);
    const custoTotal = viagensCalc * (editValores.custoPorViagem || 0);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: editandoId, ...editValores, pesoPorCarga: pesoC || undefined, quantidadeViagens: viagensCalc, custoTotal }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((i) => (i.id === editandoId ? json.data : i)));
      setEditandoId(null);
      setEditValores({});
      showToast("Frete atualizado");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  // ── COTACAO: Enviar ──
  const handleEnviarCotacao = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes/cotacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setCotacoes(json.data);
    const enviados = json.resultados?.filter((r) => r.emailOk).length || 0;
    showToast(`Cotacao enviada para ${enviados} transportadora${enviados !== 1 ? "s" : ""}`);
  };

  // ── COTACAO: Upload anexo ──
  const handleUploadAnexo = async (cotacaoId, file) => {
    setUploadingId(cotacaoId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload-blob", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();
      if (uploadJson.error) throw new Error(uploadJson.error);

      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes/cotacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cotacaoId,
          anexoUrl: uploadJson.url,
          anexoNome: uploadJson.nomeArquivo,
          status: "RECEBIDA",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCotacoes((prev) => prev.map((c) => (c.id === cotacaoId ? json.data : c)));
      showToast("Cotacao anexada com sucesso");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setUploadingId(null);
    }
  };

  // ── COTACAO: Atualizar status/valor ──
  const handleAtualizarCotacao = async (cotacaoId, campos) => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes/cotacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotacaoId, ...campos }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCotacoes((prev) => prev.map((c) => (c.id === cotacaoId ? json.data : c)));
      showToast("Cotacao atualizada");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  // ── COTACAO: Excluir ──
  const handleExcluirCotacao = async (cotacaoId) => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes/cotacao?cotacaoId=${cotacaoId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setCotacoes((prev) => prev.filter((c) => c.id !== cotacaoId));
      showToast("Cotacao removida");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  // Totais
  const totalFrete = itens.reduce((s, i) => s + (i.custoTotal || 0), 0);
  const totalPeso = itens.reduce((s, i) => s + (i.pesoTon || 0), 0);
  const totalViagens = itens.reduce((s, i) => s + (i.quantidadeViagens || 0), 0);

  // Cotacao selecionada (menor valor)
  const cotacaoSelecionada = cotacoes.find((c) => c.status === "SELECIONADA");

  return (
    <div className="space-y-6">
      {/* ═══ SECAO 1: ITENS DE FRETE ═══ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-torg-dark">
              {itens.length} {itens.length === 1 ? "frete" : "fretes"}
            </h3>
            {itens.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-torg-gray">
                <span>{fmtNum(totalPeso, 2)} ton</span>
                <span className="text-gray-300">|</span>
                <span>{totalViagens} viagens</span>
                <span className="text-gray-300">|</span>
                <span className="font-semibold text-torg-dark">{fmtMoeda(totalFrete)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {itens.length > 0 && (
              <button
                onClick={() => setShowCotacaoModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-torg-blue text-torg-blue rounded-lg text-sm font-medium hover:bg-torg-blue/5 transition-colors"
              >
                <Send size={14} />
                Solicitar Cotacao
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors"
            >
              <Plus size={14} />
              Adicionar Frete
            </button>
          </div>
        </div>

        {/* Cards resumo */}
        {itens.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-0.5">Peso Total</p>
              <p className="text-lg font-bold text-blue-800">{fmtNum(totalPeso, 2)} ton</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs text-amber-600 font-medium mb-0.5">Total Viagens</p>
              <p className="text-lg font-bold text-amber-800">{totalViagens}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
              <p className="text-xs text-emerald-600 font-medium mb-0.5">Custo Total Frete</p>
              <p className="text-lg font-bold text-emerald-800">{fmtMoeda(totalFrete)}</p>
            </div>
          </div>
        )}

        {/* Tabela de fretes */}
        {itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Truck size={40} className="text-gray-200 mb-3" />
            <p className="text-sm text-torg-gray mb-1">Nenhum frete cadastrado</p>
            <p className="text-xs text-gray-400">Adicione fretes para calcular os custos de transporte da obra.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100 whitespace-nowrap">
                  <th className="py-2.5 px-2 w-8">#</th>
                  <th className="py-2.5 px-2">Descricao</th>
                  <th className="py-2.5 px-2">Origem → Destino</th>
                  <th className="py-2.5 px-2 text-right">Dist. (km)</th>
                  <th className="py-2.5 px-2 text-right">Peso (ton)</th>
                  <th className="py-2.5 px-2 text-right">Peso/Carga</th>
                  <th className="py-2.5 px-2">Veiculo</th>
                  <th className="py-2.5 px-2 text-right">Viagens</th>
                  <th className="py-2.5 px-2 text-right">R$/Viagem</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itens.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    {editandoId === item.id ? (
                      <>
                        <td className="py-1.5 px-2 text-xs text-gray-400">{idx + 1}</td>
                        <td className="py-1.5 px-2"><input type="text" value={editValores.descricao} onChange={(e) => setEditValores((v) => ({ ...v, descricao: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none" /></td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1">
                            <input type="text" value={editValores.origem} onChange={(e) => setEditValores((v) => ({ ...v, origem: e.target.value }))} placeholder="Origem" className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none" />
                            <span className="text-gray-300 text-xs">→</span>
                            <input type="text" value={editValores.destino} onChange={(e) => setEditValores((v) => ({ ...v, destino: e.target.value }))} placeholder="Destino" className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none" />
                          </div>
                        </td>
                        <td className="py-1.5 px-2"><input type="number" value={editValores.distanciaKm} onChange={(e) => setEditValores((v) => ({ ...v, distanciaKm: parseFloat(e.target.value) || 0 }))} className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none" /></td>
                        <td className="py-1.5 px-2"><input type="number" value={editValores.pesoTon} onChange={(e) => setEditValores((v) => ({ ...v, pesoTon: parseFloat(e.target.value) || 0 }))} className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none" /></td>
                        <td className="py-1.5 px-2"><input type="number" value={editValores.pesoPorCarga} onChange={(e) => setEditValores((v) => ({ ...v, pesoPorCarga: e.target.value }))} placeholder="—" min="0" step="0.01" className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none" /></td>
                        <td className="py-1.5 px-2">
                          <select value={editValores.tipoVeiculo} onChange={(e) => setEditValores((v) => ({ ...v, tipoVeiculo: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none">
                            {TIPOS_VEICULO.map((v) => (<option key={v.value} value={v.value}>{v.label}</option>))}
                          </select>
                        </td>
                        <td className="py-1.5 px-2"><input type="number" value={editValores.quantidadeViagens} onChange={(e) => setEditValores((v) => ({ ...v, quantidadeViagens: parseInt(e.target.value) || 1 }))} min="1" className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none" /></td>
                        <td className="py-1.5 px-2"><input type="number" value={editValores.custoPorViagem} onChange={(e) => setEditValores((v) => ({ ...v, custoPorViagem: parseFloat(e.target.value) || 0 }))} min="0" step="0.01" className="w-24 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none" /></td>
                        <td className="py-1.5 px-2 text-right text-xs font-medium tabular-nums text-torg-dark">
                          {(() => { const pc = parseFloat(editValores.pesoPorCarga) || 0; const pt = editValores.pesoTon || 0; const v = pc > 0 && pt > 0 ? Math.ceil(pt / pc) : (editValores.quantidadeViagens || 1); return fmtMoeda(v * (editValores.custoPorViagem || 0)); })()}
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button>
                            <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 px-2 text-xs text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                        <td className="py-2 px-2 text-xs text-torg-gray">
                          {item.origem && item.destino ? <span>{item.origem} → {item.destino}</span> : item.destino ? <span>→ {item.destino}</span> : "—"}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNum(item.distanciaKm)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNum(item.pesoTon, 2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-torg-gray">{item.pesoPorCarga ? fmtNum(item.pesoPorCarga, 2) : "—"}</td>
                        <td className="py-2 px-2"><span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-torg-dark">{VEICULO_LABEL[item.tipoVeiculo] || item.tipoVeiculo || "—"}</span></td>
                        <td className="py-2 px-2 text-right tabular-nums">{item.quantidadeViagens || 1}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtMoeda(item.custoPorViagem)}</td>
                        <td className="py-2 px-2 text-right font-medium tabular-nums text-torg-dark">{fmtMoeda(item.custoTotal)}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"><Edit3 size={13} /></button>
                            <button onClick={() => handleExcluir(item.id)} disabled={excluindoId === item.id} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                              {excluindoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {itens.length > 0 && (
                  <tr className="bg-gray-50/60 border-t border-gray-200">
                    <td className="py-2.5 px-2" colSpan={4}></td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark tabular-nums">{fmtNum(totalPeso, 2)} ton</td>
                    <td className="py-2.5 px-2" colSpan={2}></td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark tabular-nums">{totalViagens}</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark uppercase">Total</td>
                    <td className="py-2.5 px-2 text-right text-sm font-bold text-torg-dark tabular-nums">{fmtMoeda(totalFrete)}</td>
                    <td className="py-2.5 px-2"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ SECAO 2: COTACOES DE FRETE ═══ */}
      {cotacoes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
              <Send size={15} className="text-torg-blue" />
              Cotacoes de Frete
              <span className="text-xs text-torg-gray font-normal">({cotacoes.length})</span>
            </h3>
          </div>

          <div className="space-y-2">
            {cotacoes.map((cot) => {
              const st = STATUS_COTACAO[cot.status] || STATUS_COTACAO.PENDENTE;
              const StIcon = st.icon;
              const editandoCot = cotacaoEditId === cot.id;

              return (
                <div key={cot.id} className={`border rounded-xl p-4 transition-colors ${
                  cot.status === "SELECIONADA" ? "border-emerald-300 bg-emerald-50/30" : "border-gray-100"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-torg-dark text-sm">{cot.fornecedorNome}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.cor}`}>
                          <StIcon size={12} />
                          {st.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Valor cotado */}
                      {editandoCot ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={cotacaoEditValor}
                            onChange={(e) => setCotacaoEditValor(e.target.value)}
                            placeholder="Valor R$"
                            className="w-28 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                          />
                          <input
                            type="text"
                            value={cotacaoEditPrazo}
                            onChange={(e) => setCotacaoEditPrazo(e.target.value)}
                            placeholder="Prazo"
                            className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-torg-blue/30 outline-none"
                          />
                          <button
                            onClick={() => {
                              handleAtualizarCotacao(cot.id, {
                                valorCotado: cotacaoEditValor ? parseFloat(cotacaoEditValor) : undefined,
                                prazoEntrega: cotacaoEditPrazo || undefined,
                                status: "RECEBIDA",
                              });
                              setCotacaoEditId(null);
                            }}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check size={14} />
                          </button>
                          <button onClick={() => setCotacaoEditId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                        </div>
                      ) : (
                        <>
                          {cot.valorCotado ? (
                            <span className="text-sm font-semibold text-torg-dark tabular-nums">{fmtMoeda(cot.valorCotado)}</span>
                          ) : null}
                          {cot.prazoEntrega && <span className="text-xs text-torg-gray">{cot.prazoEntrega}</span>}
                        </>
                      )}

                      {/* Acoes */}
                      {!editandoCot && (
                        <div className="flex items-center gap-1 ml-2">
                          {/* Registrar valor */}
                          <button
                            onClick={() => { setCotacaoEditId(cot.id); setCotacaoEditValor(cot.valorCotado || ""); setCotacaoEditPrazo(cot.prazoEntrega || ""); }}
                            className="p-1.5 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"
                            title="Registrar valor cotado"
                          >
                            <Edit3 size={13} />
                          </button>

                          {/* Upload anexo */}
                          <label className="p-1.5 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors cursor-pointer" title="Anexar cotacao (PDF)">
                            {uploadingId === cot.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadAnexo(cot.id, e.target.files[0]); e.target.value = ""; }} />
                          </label>

                          {/* Marcar como selecionada */}
                          {cot.status !== "SELECIONADA" && cot.valorCotado && (
                            <button
                              onClick={() => handleAtualizarCotacao(cot.id, { status: "SELECIONADA" })}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Selecionar esta cotacao"
                            >
                              <CheckCircle2 size={13} />
                            </button>
                          )}

                          {/* Excluir */}
                          <button
                            onClick={() => handleExcluirCotacao(cot.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Excluir cotacao"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Info adicional */}
                  <div className="flex items-center gap-4 mt-2 text-xs text-torg-gray">
                    <span>{cot.fornecedorEmail}</span>
                    {cot.enviadoEm && <span>Enviado {fmtData(cot.enviadoEm)}</span>}
                    {cot.respondidoEm && <span>Recebido {fmtData(cot.respondidoEm)}</span>}
                    {cot.anexoUrl && (
                      <a href={cot.anexoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-torg-blue hover:underline">
                        <Paperclip size={11} />
                        {cot.anexoNome || "Anexo"}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modais */}
      {showModal && (
        <NovoFreteModal onClose={() => setShowModal(false)} onSalvar={handleAdicionarItem} obraDefault={obraDefault} />
      )}
      {showCotacaoModal && (
        <SolicitarCotacaoModal onClose={() => setShowCotacaoModal(false)} onEnviar={handleEnviarCotacao} estudoId={estudoId} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
