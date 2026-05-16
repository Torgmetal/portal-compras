"use client";
import { useState, useMemo } from "react";
import { Building2, Plus, Search, Edit2, Trash2, Mail, Phone, MapPin, AlertCircle, Loader2, X, Filter, Tag, Settings } from "lucide-react";
import {
  CATEGORIAS_FORNECEDOR_BUILTIN,
  CORES_DISPONIVEIS,
  CHIP_CLASSES,
  mergeCategorias,
  chipCategoriaFornecedor,
  labelCategoriaFornecedor,
} from "@/lib/fornecedor-categorias";

const fmtCnpj = (s) => {
  if (!s) return null;
  const c = s.replace(/\D/g, "");
  if (c.length !== 14) return s;
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

export default function VendorListClient({ fornecedoresIniciais, categoriasCustomIniciais = [], isAdmin = false }) {
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais || []);
  const [categoriasCustom, setCategoriasCustom] = useState(categoriasCustomIniciais || []);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState(null);
  const [verInativos, setVerInativos] = useState(false);
  const [modal, setModal] = useState(null); // null | "novo" | "categorias" | fornecedor
  const [erro, setErro] = useState("");

  // Lista combinada de categorias (built-in + custom do banco)
  const todasCategorias = useMemo(() => mergeCategorias(categoriasCustom), [categoriasCustom]);

  const filtrados = useMemo(() => {
    return fornecedores.filter((f) => {
      if (!verInativos && !f.ativo) return false;
      if (filtroCat && !(f.categorias || []).includes(filtroCat)) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const haystack = [f.razaoSocial, f.nomeFantasia, f.email, f.cnpj, f.contato, f.cidade]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(b)) return false;
      }
      return true;
    });
  }, [fornecedores, busca, filtroCat, verInativos]);

  // Contagem por categoria
  const contPorCat = useMemo(() => {
    const acc = {};
    for (const f of fornecedores) {
      if (!f.ativo) continue;
      for (const c of f.categorias || []) acc[c] = (acc[c] || 0) + 1;
    }
    return acc;
  }, [fornecedores]);

  const remover = async (f) => {
    if (!window.confirm(`Remover "${f.razaoSocial}" da Vendor List? Essa ação não pode ser desfeita.`)) return;
    setErro("");
    try {
      const res = await fetch(`/api/fornecedores/${f.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setFornecedores((p) => p.filter((x) => x.id !== f.id));
    } catch (e) {
      setErro(e.message);
    }
  };

  const onSalvo = (f, novo) => {
    if (novo) {
      setFornecedores((p) => [f, ...p].sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial)));
    } else {
      setFornecedores((p) => p.map((x) => (x.id === f.id ? f : x)));
    }
    setModal(null);
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <Building2 size={26} className="text-torg-blue" /> Vendor List
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Cadastro de fornecedores classificados por categoria. Usados pra envio rápido de cotação.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModal("categorias")}
            className="px-4 py-2 border border-gray-300 text-torg-gray bg-white hover:bg-gray-50 text-sm font-medium rounded-lg inline-flex items-center gap-2"
            title="Cadastrar/editar categorias customizadas"
          >
            <Tag size={16} /> Gerenciar categorias
          </button>
          <button
            onClick={() => setModal("novo")}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2"
          >
            <Plus size={16} /> Novo fornecedor
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
        </div>
      )}

      {/* Filtros por categoria — chips clicaveis */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-torg-gray font-medium inline-flex items-center gap-1 mr-2">
            <Filter size={12} /> Filtrar:
          </span>
          <button
            onClick={() => setFiltroCat(null)}
            className={`text-xs px-3 py-1 rounded-full border font-medium ${
              filtroCat === null
                ? "bg-torg-dark text-white border-torg-dark"
                : "bg-white text-torg-gray border-gray-300 hover:bg-gray-50"
            }`}
          >
            Todas ({fornecedores.filter((f) => f.ativo).length})
          </button>
          {todasCategorias.map((cat) => {
            const active = filtroCat === cat.codigo;
            const count = contPorCat[cat.codigo] || 0;
            return (
              <button
                key={cat.codigo}
                onClick={() => setFiltroCat(active ? null : cat.codigo)}
                className={`text-xs px-3 py-1 rounded-full border font-medium ${
                  active
                    ? "bg-torg-blue text-white border-torg-blue"
                    : `${chipCategoriaFornecedor(cat.codigo, todasCategorias)} hover:opacity-80`
                }`}
              >
                {cat.label} {count > 0 && <span className="opacity-75">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca + filtros adicionais */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por razão social, email, CNPJ, contato, cidade..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <label className="text-xs text-torg-gray inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={verInativos}
            onChange={(e) => setVerInativos(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
          />
          Mostrar inativos
        </label>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {fornecedores.length === 0 ? "Nenhum fornecedor cadastrado" : "Nenhum fornecedor encontrado"}
          </p>
          {fornecedores.length === 0 && (
            <button
              onClick={() => setModal("novo")}
              className="mt-3 px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2"
            >
              <Plus size={14} /> Cadastrar o primeiro
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Razão Social / Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categorias</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Localização</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((f) => (
                  <tr key={f.id} className={`hover:bg-gray-50 ${!f.ativo ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="text-torg-dark font-medium">{f.razaoSocial}</p>
                      {f.nomeFantasia && <p className="text-xs text-torg-gray">{f.nomeFantasia}</p>}
                      {f.cnpj && <p className="text-[10px] text-torg-gray font-mono">{fmtCnpj(f.cnpj)}</p>}
                      {!f.ativo && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-1 inline-block">Inativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(f.categorias || []).map((c) => (
                          <span
                            key={c}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${chipCategoriaFornecedor(c, todasCategorias)}`}
                          >
                            {labelCategoriaFornecedor(c, todasCategorias)}
                          </span>
                        ))}
                        {(f.categorias || []).length === 0 && (
                          <span className="text-[10px] text-torg-gray italic">sem categoria</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <a
                          href={`mailto:${f.email}`}
                          className="text-xs text-torg-blue hover:underline inline-flex items-center gap-1"
                        >
                          <Mail size={11} /> {f.email}
                        </a>
                        {f.telefone && (
                          <p className="text-xs text-torg-gray inline-flex items-center gap-1">
                            <Phone size={11} /> {f.telefone}
                          </p>
                        )}
                        {f.contato && (
                          <p className="text-[11px] text-torg-gray italic">{f.contato}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-torg-gray">
                      {(f.cidade || f.uf) ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} />
                          {[f.cidade, f.uf].filter(Boolean).join(" / ")}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setModal(f)}
                          className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1"
                        >
                          <Edit2 size={12} /> Editar
                        </button>
                        <button
                          onClick={() => remover(f)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && modal !== "categorias" && (
        <ModalFornecedor
          fornecedor={modal === "novo" ? null : modal}
          categoriasDisponiveis={todasCategorias}
          onClose={() => setModal(null)}
          onSaved={onSalvo}
        />
      )}

      {modal === "categorias" && (
        <ModalGerenciarCategorias
          categoriasCustom={categoriasCustom}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onChanged={setCategoriasCustom}
        />
      )}
    </div>
  );
}

function ModalFornecedor({ fornecedor, onClose, onSaved, categoriasDisponiveis = CATEGORIAS_FORNECEDOR_BUILTIN }) {
  const editando = !!fornecedor;
  const [form, setForm] = useState({
    razaoSocial: fornecedor?.razaoSocial || "",
    nomeFantasia: fornecedor?.nomeFantasia || "",
    cnpj: fornecedor?.cnpj || "",
    email: fornecedor?.email || "",
    emailsAdicionaisTexto: (fornecedor?.emailsAdicionais || []).join(", "),
    telefone: fornecedor?.telefone || "",
    contato: fornecedor?.contato || "",
    cidade: fornecedor?.cidade || "",
    uf: fornecedor?.uf || "",
    categorias: new Set(fornecedor?.categorias || []),
    observacao: fornecedor?.observacao || "",
    nCodOmie: fornecedor?.nCodOmie || "",
    ativo: fornecedor?.ativo ?? true,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleCat = (cod) => {
    setForm((p) => {
      const next = new Set(p.categorias);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return { ...p, categorias: next };
    });
  };

  const submit = async () => {
    setErro("");
    if (!form.razaoSocial.trim()) return setErro("Razão Social é obrigatória.");
    if (!form.email.trim()) return setErro("Email é obrigatório.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setErro("Email inválido.");

    const emailsAdicionais = form.emailsAdicionaisTexto
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const e of emailsAdicionais) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return setErro(`Email adicional inválido: "${e}"`);
      }
    }

    const payload = {
      razaoSocial: form.razaoSocial,
      nomeFantasia: form.nomeFantasia || null,
      cnpj: form.cnpj || null,
      email: form.email,
      emailsAdicionais,
      telefone: form.telefone || null,
      contato: form.contato || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      categorias: Array.from(form.categorias),
      observacao: form.observacao || null,
      nCodOmie: form.nCodOmie || null,
      ativo: form.ativo,
    };

    setSalvando(true);
    try {
      const url = editando ? `/api/fornecedores/${fornecedor.id}` : "/api/fornecedores";
      const method = editando ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved(data.fornecedor, !editando);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-torg-dark">
            {editando ? "Editar fornecedor" : "Novo fornecedor"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* Identificacao */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-torg-dark mb-1">Razão Social *</label>
              <input
                type="text" value={form.razaoSocial}
                onChange={(e) => set("razaoSocial", e.target.value)}
                placeholder="Ex: Soufer Industrial Ltda"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Nome Fantasia</label>
              <input
                type="text" value={form.nomeFantasia}
                onChange={(e) => set("nomeFantasia", e.target.value)}
                placeholder="Ex: Soufer"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">CNPJ</label>
              <input
                type="text" value={form.cnpj}
                onChange={(e) => set("cnpj", e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Email principal *</label>
              <input
                type="email" value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="vendas@fornecedor.com.br"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Telefone</label>
              <input
                type="text" value={form.telefone}
                onChange={(e) => set("telefone", e.target.value)}
                placeholder="(11) 1234-5678"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Contato (vendedor)</label>
              <input
                type="text" value={form.contato}
                onChange={(e) => set("contato", e.target.value)}
                placeholder="Nome do contato"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Código no Omie</label>
              <input
                type="text" value={form.nCodOmie}
                onChange={(e) => set("nCodOmie", e.target.value)}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Emails adicionais (cópia)</label>
            <input
              type="text" value={form.emailsAdicionaisTexto}
              onChange={(e) => set("emailsAdicionaisTexto", e.target.value)}
              placeholder="financeiro@fornec.com, comercial@fornec.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
            <p className="text-[11px] text-torg-gray mt-1">Separados por vírgula. Receberão cópia (CC) das cotações.</p>
          </div>

          {/* Localizacao */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-torg-dark mb-1">Cidade</label>
              <input
                type="text" value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">UF</label>
              <input
                type="text" value={form.uf}
                onChange={(e) => set("uf", e.target.value.toUpperCase().substring(0, 2))}
                placeholder="SP"
                maxLength={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          </div>

          {/* Categorias */}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-2">
              Categorias atendidas ({form.categorias.size})
            </label>
            <div className="flex flex-wrap gap-2">
              {categoriasDisponiveis.map((cat) => {
                const ativo = form.categorias.has(cat.codigo);
                return (
                  <button
                    key={cat.codigo}
                    type="button"
                    onClick={() => toggleCat(cat.codigo)}
                    className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                      ativo
                        ? "bg-torg-blue text-white border-torg-blue"
                        : `${chipCategoriaFornecedor(cat.codigo, categoriasDisponiveis)} hover:opacity-80`
                    }`}
                  >
                    {ativo && "✓ "}{cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Observacao */}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <textarea
              value={form.observacao}
              onChange={(e) => set("observacao", e.target.value)}
              rows={2}
              placeholder="Notas internas sobre esse fornecedor"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>

          {/* Ativo */}
          {editando && (
            <label className="inline-flex items-center gap-2 text-sm text-torg-dark cursor-pointer">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => set("ativo", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
              />
              Fornecedor ativo
            </label>
          )}
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={salvando}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            {editando ? "Salvar alterações" : "Cadastrar fornecedor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal pra cadastrar e remover categorias customizadas de fornecedor.
// Built-in (MATERIA_PRIMA, TINTA, etc) ficam visiveis mas nao editaveis.
function ModalGerenciarCategorias({ categoriasCustom, isAdmin, onClose, onChanged }) {
  const [novaLabel, setNovaLabel] = useState("");
  const [novaCor, setNovaCor] = useState("slate");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [removendoId, setRemovendoId] = useState(null);

  const adicionar = async () => {
    setErro("");
    if (!novaLabel.trim()) return setErro("Informe o nome da categoria.");
    setSalvando(true);
    try {
      const res = await fetch("/api/categorias-fornecedor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: novaLabel.trim(), color: novaCor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onChanged([...categoriasCustom, data.item]);
      setNovaLabel("");
      setNovaCor("slate");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (cat) => {
    if (!window.confirm(`Remover a categoria "${cat.label}"?`)) return;
    setErro("");
    setRemovendoId(cat.id);
    try {
      const res = await fetch(`/api/categorias-fornecedor/${cat.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onChanged(categoriasCustom.filter((c) => c.id !== cat.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setRemovendoId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <Tag size={18} /> Gerenciar categorias de fornecedor
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* Built-in (não editáveis) */}
          <div>
            <p className="text-xs font-semibold text-torg-gray uppercase mb-2">Categorias padrão (7)</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS_FORNECEDOR_BUILTIN.map((c) => (
                <span
                  key={c.codigo}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${chipCategoriaFornecedor(c.codigo, CATEGORIAS_FORNECEDOR_BUILTIN)}`}
                  title="Categoria built-in — não pode ser removida"
                >
                  🔒 {c.label}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-torg-gray mt-1.5 italic">
              Categorias padrão são fixas — não podem ser removidas nem editadas.
            </p>
          </div>

          {/* Custom (editáveis) */}
          <div>
            <p className="text-xs font-semibold text-torg-gray uppercase mb-2">
              Categorias customizadas ({categoriasCustom.length})
            </p>
            {categoriasCustom.length === 0 ? (
              <p className="text-xs text-torg-gray italic bg-gray-50 border border-gray-200 rounded p-3">
                Nenhuma categoria customizada ainda. Crie a primeira no formulário abaixo.
              </p>
            ) : (
              <div className="space-y-2">
                {categoriasCustom.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className={`text-xs px-3 py-1 rounded-full border font-medium ${
                          CHIP_CLASSES[c.color] || CHIP_CLASSES.slate
                        }`}
                      >
                        {c.label}
                      </span>
                      <span className="text-[10px] text-torg-gray font-mono">{c.codigo}</span>
                    </div>
                    {isAdmin ? (
                      <button
                        onClick={() => remover(c)}
                        disabled={removendoId === c.id}
                        className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {removendoId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Remover
                      </button>
                    ) : (
                      <span className="text-[10px] text-torg-gray italic">apenas admin remove</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulário de nova */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-torg-gray uppercase mb-2">Adicionar nova categoria</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">Nome *</label>
                <input
                  type="text"
                  value={novaLabel}
                  onChange={(e) => setNovaLabel(e.target.value)}
                  placeholder="Ex: Pintura Automotiva, Borracharia, Soldas"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                />
                <p className="text-[10px] text-torg-gray mt-0.5">
                  O sistema gera o código automático (ex: "Pintura Automotiva" → <code>PINTURA_AUTOMOTIVA</code>).
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {CORES_DISPONIVEIS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNovaCor(c)}
                      className={`text-xs px-3 py-1 rounded-full border font-medium ${
                        CHIP_CLASSES[c] || CHIP_CLASSES.slate
                      } ${novaCor === c ? "ring-2 ring-torg-blue ring-offset-1" : ""}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {novaLabel && (
                <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded p-2 text-xs">
                  <span className="text-torg-gray">Preview: </span>
                  <span className={`px-3 py-1 rounded-full border font-medium ${CHIP_CLASSES[novaCor]}`}>
                    {novaLabel.trim()}
                  </span>
                </div>
              )}

              <button
                onClick={adicionar}
                disabled={salvando || !novaLabel.trim()}
                className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Adicionar categoria
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end sticky bottom-0">
          <button onClick={onClose} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
