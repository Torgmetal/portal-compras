"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Loader2, Shield } from "lucide-react";
import { useStore } from "@/lib/store";
import SenhaGeradaModal from "@/components/admin/SenhaGeradaModal";

const MODULOS_OPCOES = [
  { value: "COMERCIAL",    label: "Comercial" },
  { value: "ENGENHARIA",   label: "Engenharia" },
  { value: "COMPRAS",      label: "Compras" },
  { value: "PRODUCAO",     label: "Produção" },
  { value: "ALMOXARIFADO", label: "Almoxarifado" },
  { value: "FINANCEIRO",   label: "Financeiro" },
  { value: "EXPEDICAO",    label: "Expedição" },
  { value: "RH",           label: "RH" },
  { value: "PLANEJAMENTO", label: "Planejamento" },
  { value: "PCP",          label: "PCP" },
];

const campoVazio = {
  name:             "",
  email:            "",
  tipo:             "",
  modulos:          [],
  setor:            "",
  podeAlterarVerba: false,
};

export default function FormNovoUsuario() {
  const router = useRouter();
  const { showToast } = useStore();

  const [form, setForm] = useState(campoVazio);
  const [erros, setErros] = useState({});
  const [loading, setLoading] = useState(false);

  // Dados do modal de senha gerada
  const [modal, setModal] = useState(null);
  // modal shape: { senha, nomeUsuario, emailUsuario }

  /* ── Helpers de campo ──────────────────────────────────────────── */

  function setcampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    if (erros[campo]) setErros((prev) => ({ ...prev, [campo]: null }));
  }

  function toggleModulo(modulo) {
    setForm((prev) => {
      const atual = prev.modulos;
      const novo = atual.includes(modulo)
        ? atual.filter((m) => m !== modulo)
        : [...atual, modulo];
      return { ...prev, modulos: novo };
    });
    if (erros.modulos) setErros((prev) => ({ ...prev, modulos: null }));
  }

  function validarFront() {
    const novosErros = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      novosErros.name = "Nome deve ter pelo menos 2 caracteres.";
    if (!form.email.trim())
      novosErros.email = "E-mail é obrigatório.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      novosErros.email = "E-mail inválido.";
    if (!form.tipo)
      novosErros.tipo = "Selecione o tipo de usuário.";
    if (form.tipo === "USUARIO" && form.modulos.length === 0)
      novosErros.modulos = "Selecione pelo menos um módulo.";
    return novosErros;
  }

  /* ── Submit ────────────────────────────────────────────────────── */

  async function handleSubmit(e) {
    e.preventDefault();
    const errosFront = validarFront();
    if (Object.keys(errosFront).length > 0) {
      setErros(errosFront);
      return;
    }

    setLoading(true);
    setErros({});
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:             form.name.trim(),
          email:            form.email.trim(),
          tipo:             form.tipo,
          modulos:          form.tipo === "ADMIN" ? [] : form.modulos,
          setor:            form.setor.trim() || null,
          podeAlterarVerba: form.podeAlterarVerba,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        if (json.error?.toLowerCase().includes("e-mail") || json.error?.toLowerCase().includes("email")) {
          setErros({ email: json.error });
        } else {
          showToast(json.error || "Erro ao criar usuário.", "error");
        }
        return;
      }

      const { usuario, senhaTemporaria } = json.data;
      setModal({
        senha:        senhaTemporaria,
        nomeUsuario:  usuario.name,
        emailUsuario: usuario.email,
      });
    } catch {
      showToast("Erro de conexão. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleFecharModal() {
    setModal(null);
    router.push("/admin/usuarios");
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="max-w-xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/usuarios"
          className="p-1.5 rounded-lg text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 transition-colors"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-torg-blue/10 rounded-lg">
            <UserPlus size={20} className="text-torg-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-torg-dark">Novo usuário</h1>
            <p className="text-xs text-torg-gray mt-0.5">Uma senha temporária será gerada automaticamente</p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 space-y-5">

            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1.5">
                Nome completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setcampo("name", e.target.value)}
                placeholder="Ex: Maria Silva"
                disabled={loading}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400 ${
                  erros.name ? "border-red-400 bg-red-50" : "border-gray-200"
                }`}
              />
              {erros.name && <p className="mt-1 text-xs text-red-500">{erros.name}</p>}
            </div>

            {/* E-mail */}
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1.5">
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setcampo("email", e.target.value)}
                placeholder="usuario@torg.com.br"
                disabled={loading}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400 ${
                  erros.email ? "border-red-400 bg-red-50" : "border-gray-200"
                }`}
              />
              {erros.email && <p className="mt-1 text-xs text-red-500">{erros.email}</p>}
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1.5">
                Tipo <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {[
                  { value: "USUARIO", label: "Usuário", desc: "Acesso restrito aos módulos selecionados" },
                  { value: "ADMIN",   label: "Admin",   desc: "Acesso total ao sistema" },
                ].map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setcampo("tipo", value); if (value === "ADMIN") setcampo("modulos", []); }}
                    disabled={loading}
                    className={`flex-1 flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                      form.tipo === value
                        ? "border-torg-blue bg-torg-blue/5 ring-1 ring-torg-blue/30"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${form.tipo === value ? "text-torg-blue" : "text-torg-dark"}`}>
                      {value === "ADMIN" && <Shield size={13} />}
                      {label}
                    </span>
                    <span className="text-xs text-torg-gray mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
              {erros.tipo && <p className="mt-1 text-xs text-red-500">{erros.tipo}</p>}
            </div>

            {/* Módulos — só aparece para tipo USUARIO */}
            {form.tipo === "USUARIO" && (
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-2">
                  Módulos <span className="text-red-500">*</span>
                  <span className="font-normal text-torg-gray ml-1">(selecione ao menos um)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MODULOS_OPCOES.map(({ value, label }) => {
                    const ativo = form.modulos.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleModulo(value)}
                        disabled={loading}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                          ativo
                            ? "border-torg-blue bg-torg-blue/5 text-torg-blue font-medium"
                            : "border-gray-200 text-torg-dark hover:border-gray-300"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                          ativo ? "bg-torg-blue border-torg-blue" : "border-gray-300"
                        }`}>
                          {ativo && (
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
                {erros.modulos && <p className="mt-1 text-xs text-red-500">{erros.modulos}</p>}
              </div>
            )}

            {/* Setor */}
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1.5">
                Setor <span className="text-torg-gray font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.setor}
                onChange={(e) => setcampo("setor", e.target.value)}
                placeholder="Ex: Comercial Externo"
                disabled={loading}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* podeAlterarVerba */}
            <div className="flex items-start gap-3 py-1">
              <input
                id="podeAlterarVerba"
                type="checkbox"
                checked={form.podeAlterarVerba}
                onChange={(e) => setcampo("podeAlterarVerba", e.target.checked)}
                disabled={loading}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-torg-blue disabled:opacity-50"
              />
              <label htmlFor="podeAlterarVerba" className="text-sm text-torg-dark cursor-pointer select-none">
                Pode alterar verba
                <span className="block text-xs text-torg-gray mt-0.5">
                  Permite que o usuário edite o valor de verba em ordens de produção.
                </span>
              </label>
            </div>

          </div>

          {/* Rodapé do form */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
            <Link
              href="/admin/usuarios"
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-torg-blue hover:bg-torg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Criar usuário
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Modal de senha gerada */}
      {modal && (
        <SenhaGeradaModal
          open={!!modal}
          onClose={handleFecharModal}
          senha={modal.senha}
          nomeUsuario={modal.nomeUsuario}
          emailUsuario={modal.emailUsuario}
        />
      )}
    </div>
  );
}
