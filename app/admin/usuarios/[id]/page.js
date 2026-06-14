"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  UserCog,
  Loader2,
  KeyRound,
  UserCheck,
  UserX,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { useStore } from "@/lib/store";
import ConfirmModal from "@/components/admin/ConfirmModal";
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
  { value: "REQUISICOES",  label: "Requisições" },
  { value: "QUALIDADE",    label: "Qualidade" },
];

export default function PageEditarUsuario() {
  const router = useRouter();
  const { id } = useParams();
  const { data: session } = useSession();
  const { showToast } = useStore();

  const proprio = session?.user?.id === id;

  // Dados originais do usuário (referência para diff)
  const [original, setOriginal] = useState(null);

  // Estado do formulário
  const [form, setForm] = useState({
    name: "", email: "", tipo: "", modulos: [], setor: "", podeAlterarVerba: false,
  });
  const [ativo, setAtivo] = useState(true);

  const [erros, setErros] = useState({});
  const [loadingPagina, setLoadingPagina] = useState(true);
  const [erroPagina, setErroPagina] = useState(null);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [loadingAcao, setLoadingAcao] = useState(false); // reset/ativar/desativar

  // Modais
  const [modalConfirm, setModalConfirm] = useState(null);
  // modalConfirm shape: { tipo: "resetSenha"|"resetSenhaProprio"|"desativar"|"ativar" }
  const [modalSenha, setModalSenha] = useState(null);
  // modalSenha shape: { senha, nomeUsuario, emailUsuario }

  /* ── Carregamento ──────────────────────────────────────────────── */

  const carregar = useCallback(async () => {
    setLoadingPagina(true);
    setErroPagina(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Erro ao carregar usuário.");
      const u = json.data;
      setOriginal(u);
      setForm({
        name:             u.name,
        email:            u.email,
        tipo:             u.tipo,
        modulos:          (u.modulos ?? []).map((m) => m.modulo ?? m),
        setor:            u.setor ?? "",
        podeAlterarVerba: u.podeAlterarVerba,
      });
      setAtivo(u.ativo);
    } catch (e) {
      setErroPagina(e.message);
    } finally {
      setLoadingPagina(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  /* ── Helpers ───────────────────────────────────────────────────── */

  function setcampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    if (erros[campo]) setErros((prev) => ({ ...prev, [campo]: null }));
  }

  function validarFront() {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 2)
      e.name = "Nome deve ter pelo menos 2 caracteres.";
    if (!form.email.trim())
      e.email = "E-mail é obrigatório.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "E-mail inválido.";
    if (!form.tipo)
      e.tipo = "Selecione o tipo de usuário.";
    if (form.tipo === "USUARIO" && form.modulos.length === 0)
      e.modulos = "Selecione pelo menos um módulo.";
    return e;
  }

  /* ── Salvar edição ─────────────────────────────────────────────── */

  async function handleSalvar(e) {
    e.preventDefault();
    const errosFront = validarFront();
    if (Object.keys(errosFront).length > 0) { setErros(errosFront); return; }

    setLoadingSalvar(true);
    setErros({});
    try {
      const body = { name: form.name.trim(), email: form.email.trim(), setor: form.setor.trim() || null };
      // Anti-suicídio: não enviar tipo/modulos/podeAlterarVerba se for o próprio admin
      if (!proprio) {
        body.tipo = form.tipo;
        body.modulos = form.tipo === "ADMIN" ? [] : form.modulos;
        body.podeAlterarVerba = form.podeAlterarVerba;
      }

      const res = await fetch(`/api/admin/usuarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.error?.toLowerCase().includes("e-mail") || json.error?.toLowerCase().includes("email"))
          setErros({ email: json.error });
        else showToast(json.error || "Erro ao salvar.", "error");
        return;
      }
      setOriginal(json.data);
      showToast("Usuário atualizado com sucesso.", "success");
    } catch {
      showToast("Erro de conexão. Tente novamente.", "error");
    } finally {
      setLoadingSalvar(false);
    }
  }

  /* ── Ações de status ───────────────────────────────────────────── */

  async function executarAcao(tipo) {
    setModalConfirm(null);
    setLoadingAcao(true);
    try {
      if (tipo === "resetSenha" || tipo === "resetSenhaProprio") {
        const res = await fetch(`/api/admin/usuarios/${id}/reset-senha`, { method: "POST" });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Erro ao resetar senha.");
        setModalSenha({ senha: json.data.senhaTemporaria, nomeUsuario: original.name, emailUsuario: json.data.emailAlvo });
      } else if (tipo === "desativar") {
        const res = await fetch(`/api/admin/usuarios/${id}/desativar`, { method: "POST" });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Erro ao desativar.");
        setAtivo(false);
        showToast(`Usuário ${original.name} desativado.`, "success");
      } else if (tipo === "ativar") {
        const res = await fetch(`/api/admin/usuarios/${id}/ativar`, { method: "POST" });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Erro ao ativar.");
        setAtivo(true);
        showToast(`Usuário ${original.name} reativado.`, "success");
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoadingAcao(false);
    }
  }

  /* ── Dados dos modais de confirmação ───────────────────────────── */

  function dadosModalConfirm() {
    if (!modalConfirm) return {};
    const tipo = modalConfirm.tipo;
    if (tipo === "resetSenha") return {
      titulo: "Resetar senha",
      mensagem: `Será gerada uma nova senha temporária para "${original?.name}".\n\nA senha atual será invalidada imediatamente.`,
      labelConfirmar: "Resetar senha",
      variant: "padrao",
    };
    if (tipo === "resetSenhaProprio") return {
      titulo: "Resetar sua própria senha",
      mensagem: `Você está prestes a resetar a sua própria senha de acesso.\n\nUma nova senha temporária será gerada e a atual será invalidada. Você continuará logado até o fim da sessão, mas precisará usar a nova senha no próximo login.\n\nTem certeza que deseja continuar?`,
      labelConfirmar: "Sim, resetar minha senha",
      variant: "destrutivo",
    };
    if (tipo === "desativar") return {
      titulo: "Desativar usuário",
      mensagem: `Tem certeza que deseja desativar "${original?.name}" (${original?.email})?\n\nO usuário não conseguirá mais acessar o portal.`,
      labelConfirmar: "Desativar",
      variant: "destrutivo",
    };
    if (tipo === "ativar") return {
      titulo: "Reativar usuário",
      mensagem: `Deseja reativar "${original?.name}" (${original?.email})?\n\nO usuário voltará a ter acesso ao portal.`,
      labelConfirmar: "Reativar",
      variant: "padrao",
    };
    return {};
  }

  /* ── Estados de carregamento / erro ────────────────────────────── */

  if (loadingPagina) {
    return (
      <div className="flex items-center justify-center py-24 text-torg-gray text-sm gap-2">
        <RefreshCw size={16} className="animate-spin" />
        Carregando usuário...
      </div>
    );
  }

  if (erroPagina) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-red-500">{erroPagina}</p>
        <button onClick={carregar} className="text-sm text-torg-blue hover:underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  /* ── Render principal ──────────────────────────────────────────── */

  return (
    <div className="max-w-xl mx-auto space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/usuarios"
          className="p-1.5 rounded-lg text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 transition-colors"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-torg-blue/10 rounded-lg">
            <UserCog size={20} className="text-torg-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-torg-dark">
              {original?.name}
              {proprio && (
                <span className="ml-2 text-[11px] bg-torg-blue/10 text-torg-blue px-1.5 py-0.5 rounded font-semibold tracking-wide align-middle">
                  VOCÊ
                </span>
              )}
            </h1>
            <p className="text-xs text-torg-gray mt-0.5">{original?.email}</p>
          </div>
        </div>
      </div>

      {/* Aviso: conta inativa */}
      {!ativo && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-500">
          <UserX size={16} className="shrink-0" />
          Esta conta está <span className="font-semibold">inativa</span>. O usuário não consegue acessar o portal.
        </div>
      )}

      {/* ── Card: Dados ──────────────────────────────────────────── */}
      <form onSubmit={handleSalvar} noValidate>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-torg-dark">Dados do usuário</h2>
          </div>

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
                disabled={loadingSalvar}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400 ${erros.name ? "border-red-400 bg-red-50" : "border-gray-200"}`}
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
                disabled={loadingSalvar}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400 ${erros.email ? "border-red-400 bg-red-50" : "border-gray-200"}`}
              />
              {erros.email && <p className="mt-1 text-xs text-red-500">{erros.email}</p>}
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-torg-dark mb-1.5">
                Tipo <span className="text-red-500">*</span>
              </label>
              {proprio ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={form.tipo === "ADMIN" ? "Admin" : "Usuário"}
                    disabled
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400"
                  />
                  <span title="Você não pode alterar seu próprio tipo">
                    <ShieldAlert size={16} className="text-amber-400 shrink-0" />
                  </span>
                </div>
              ) : (
                <div className="flex gap-3">
                  {[
                    { value: "USUARIO", label: "Usuário", desc: "Acesso restrito aos módulos" },
                    { value: "ADMIN",   label: "Admin",   desc: "Acesso total ao sistema" },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setcampo("tipo", value); if (value === "ADMIN") setcampo("modulos", []); }}
                      disabled={loadingSalvar}
                      className={`flex-1 flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                        form.tipo === value
                          ? "border-torg-blue bg-torg-blue/5 ring-1 ring-torg-blue/30"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className={`text-sm font-medium ${form.tipo === value ? "text-torg-blue" : "text-torg-dark"}`}>{label}</span>
                      <span className="text-xs text-torg-gray mt-0.5">{desc}</span>
                    </button>
                  ))}
                </div>
              )}
              {proprio && (
                <p className="mt-1 text-xs text-amber-600">Você não pode alterar seu próprio tipo.</p>
              )}
              {erros.tipo && <p className="mt-1 text-xs text-red-500">{erros.tipo}</p>}
            </div>

            {/* Módulos — só editável se tipo === USUARIO e não for o próprio */}
            {form.tipo === "USUARIO" && (
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-2">
                  Módulos <span className="text-red-500">*</span>
                </label>
                {proprio ? (
                  <p className="text-xs text-torg-gray">Você não pode alterar seus próprios módulos.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {MODULOS_OPCOES.map(({ value, label }) => {
                      const ativo = form.modulos.includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setForm((prev) => {
                              const mods = prev.modulos;
                              return { ...prev, modulos: mods.includes(value) ? mods.filter((m) => m !== value) : [...mods, value] };
                            });
                            if (erros.modulos) setErros((prev) => ({ ...prev, modulos: null }));
                          }}
                          disabled={loadingSalvar}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                            ativo
                              ? "border-torg-blue bg-torg-blue/5 text-torg-blue font-medium"
                              : "border-gray-200 text-torg-dark hover:border-gray-300"
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${ativo ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
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
                )}
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
                disabled={loadingSalvar}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* podeAlterarVerba */}
            <div className={`flex items-start gap-3 py-1 ${proprio ? "opacity-50" : ""}`}>
              <input
                id="podeAlterarVerba"
                type="checkbox"
                checked={form.podeAlterarVerba}
                onChange={(e) => setcampo("podeAlterarVerba", e.target.checked)}
                disabled={loadingSalvar || proprio}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-torg-blue disabled:opacity-50"
              />
              <label
                htmlFor="podeAlterarVerba"
                className={`text-sm text-torg-dark select-none ${proprio ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                Pode alterar verba
                <span className="block text-xs text-torg-gray mt-0.5">
                  {proprio
                    ? "Você não pode alterar seu próprio podeAlterarVerba."
                    : "Permite que o usuário edite o valor de verba em ordens de produção."}
                </span>
              </label>
            </div>

          </div>

          {/* Rodapé */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={loadingSalvar}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-torg-blue hover:bg-torg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {loadingSalvar ? (
                <><Loader2 size={14} className="animate-spin" />Salvando...</>
              ) : (
                "Salvar alterações"
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ── Card: Resetar senha ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-torg-dark">Senha</h2>
        </div>
        <div className="px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-torg-dark font-medium">Resetar senha</p>
            <p className="text-xs text-torg-gray mt-0.5">
              Gera uma nova senha temporária e invalida a atual imediatamente.
              {proprio && " Você continuará logado até o fim da sessão."}
            </p>
          </div>
          <button
            onClick={() => setModalConfirm({ tipo: proprio ? "resetSenhaProprio" : "resetSenha" })}
            disabled={loadingAcao}
            className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 text-torg-dark rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            {loadingAcao ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Resetar senha
          </button>
        </div>
      </div>

      {/* ── Card: Status da conta ────────────────────────────────── */}
      {!proprio && (
        <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!ativo ? "border-gray-100" : "border-gray-100"}`}>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-torg-dark">Status da conta</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-torg-dark font-medium">
                Conta {ativo ? "ativa" : "inativa"}
              </p>
              <p className="text-xs text-torg-gray mt-0.5">
                {ativo
                  ? "O usuário tem acesso ao portal. Desativar impede o login imediatamente."
                  : "O usuário não tem acesso ao portal. Reativar restaura o acesso."}
              </p>
            </div>
            {ativo ? (
              <button
                onClick={() => setModalConfirm({ tipo: "desativar" })}
                disabled={loadingAcao}
                className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-50"
              >
                {loadingAcao ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
                Desativar
              </button>
            ) : (
              <button
                onClick={() => setModalConfirm({ tipo: "ativar" })}
                disabled={loadingAcao}
                className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border border-green-200 text-green-700 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors disabled:opacity-50"
              >
                {loadingAcao ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                Reativar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Modais ──────────────────────────────────────────────── */}
      {modalConfirm && (
        <ConfirmModal
          open={!!modalConfirm}
          onClose={() => setModalConfirm(null)}
          onConfirm={() => executarAcao(modalConfirm.tipo)}
          loading={loadingAcao}
          {...dadosModalConfirm()}
        />
      )}

      {modalSenha && (
        <SenhaGeradaModal
          open={!!modalSenha}
          onClose={() => setModalSenha(null)}
          senha={modalSenha.senha}
          nomeUsuario={modalSenha.nomeUsuario}
          emailUsuario={modalSenha.emailUsuario}
        />
      )}
    </div>
  );
}
