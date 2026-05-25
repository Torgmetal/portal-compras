"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  RefreshCw,
  ChevronDown,
  Shield,
  CheckCircle2,
  XCircle,
  KeyRound,
  Pencil,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import { useStore } from "@/lib/store";
import ConfirmModal from "@/components/admin/ConfirmModal";

/* ─── Constantes ────────────────────────────────────────────────── */

const MODULO_LABELS = {
  COMERCIAL:    { label: "Comercial",    cor: "bg-blue-100 text-blue-700" },
  ENGENHARIA:   { label: "Engenharia",   cor: "bg-cyan-100 text-cyan-700" },
  COMPRAS:      { label: "Compras",      cor: "bg-orange-100 text-orange-700" },
  PRODUCAO:     { label: "Produção",     cor: "bg-green-100 text-green-700" },
  ALMOXARIFADO: { label: "Almoxarifado", cor: "bg-yellow-100 text-yellow-700" },
  FINANCEIRO:   { label: "Financeiro",   cor: "bg-pink-100 text-pink-700" },
  EXPEDICAO:    { label: "Expedição",    cor: "bg-teal-100 text-teal-700" },
};

const FILTRO_OPCOES = [
  { value: "",         label: "Todos os usuários" },
  { value: "ADMIN",    label: "Admin" },
  ...Object.entries(MODULO_LABELS).map(([value, { label }]) => ({ value, label })),
];

/* ─── Componente de senha revelada inline ───────────────────────── */

function SenhaReveladaInline({ senha, emailAlvo, onFechar }) {
  const [visivel, setVisivel] = useState(false);
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(senha).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-torg-blue/30 bg-torg-blue-50/40 px-4 py-3 text-sm">
      <p className="text-torg-dark font-medium mb-2">
        Senha temporária gerada para <span className="font-semibold">{emailAlvo}</span>:
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-white border border-gray-200 px-3 py-1.5 text-sm font-mono tracking-widest text-torg-dark select-all">
          {visivel ? senha : "••••••••"}
        </code>
        <button
          onClick={() => setVisivel((v) => !v)}
          title={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="p-1.5 rounded text-torg-gray hover:text-torg-dark hover:bg-white transition-colors"
        >
          {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          onClick={copiar}
          title="Copiar senha"
          className="p-1.5 rounded text-torg-gray hover:text-torg-dark hover:bg-white transition-colors"
        >
          {copiado ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>
      <p className="text-xs text-torg-gray mt-2">
        Anote agora — esta senha não será exibida novamente.
      </p>
      <button
        onClick={onFechar}
        className="mt-2 text-xs text-torg-blue hover:underline"
      >
        Fechar
      </button>
    </div>
  );
}

/* ─── Página principal ──────────────────────────────────────────── */

export default function ListagemUsuarios() {
  const { data: session } = useSession();
  const { showToast } = useStore();

  // Dados
  const [usuarios, setUsuarios] = useState([]);
  const [loadingPagina, setLoadingPagina] = useState(true);
  const [erroCarregar, setErroCarregar] = useState(null);

  // Filtros (client-side)
  const [filtroModulo, setFiltroModulo] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);

  // Ações em andamento — guarda o id do usuário sendo processado
  const [loadingAcao, setLoadingAcao] = useState(null);

  // Senha gerada após reset — { senha, emailAlvo, userId }
  const [senhaGerada, setSenhaGerada] = useState(null);

  // Modais
  const [modal, setModal] = useState(null);
  // modal shape: { tipo: "desativar"|"ativar"|"resetSenha"|"resetSenhaProprio", usuario: {...} }

  /* ── Carregamento ──────────────────────────────────────────────── */

  const carregar = useCallback(async () => {
    setLoadingPagina(true);
    setErroCarregar(null);
    try {
      const res = await fetch("/api/admin/usuarios?ativo=todos");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Erro ao carregar usuários.");
      setUsuarios(json.data);
    } catch (e) {
      setErroCarregar(e.message);
    } finally {
      setLoadingPagina(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* ── Filtragem client-side ─────────────────────────────────────── */

  const usuariosFiltrados = usuarios.filter((u) => {
    if (!mostrarInativos && !u.ativo) return false;
    if (filtroModulo) {
      if (filtroModulo === "ADMIN") return u.tipo === "ADMIN";
      const mods = (u.modulos ?? []).map((m) => m.modulo ?? m);
      return mods.includes(filtroModulo);
    }
    return true;
  });

  /* ── Ações ─────────────────────────────────────────────────────── */

  async function executarAcao(tipo, usuario) {
    setLoadingAcao(usuario.id);
    setModal(null);
    try {
      let res, json;
      if (tipo === "desativar") {
        res = await fetch(`/api/admin/usuarios/${usuario.id}/desativar`, { method: "POST" });
        json = await res.json();
        if (!json.success) throw new Error(json.error || "Erro ao desativar.");
        setUsuarios((prev) => prev.map((u) => u.id === usuario.id ? { ...u, ativo: false } : u));
        showToast(`Usuário ${usuario.name} desativado.`, "success");
      } else if (tipo === "ativar") {
        res = await fetch(`/api/admin/usuarios/${usuario.id}/ativar`, { method: "POST" });
        json = await res.json();
        if (!json.success) throw new Error(json.error || "Erro ao ativar.");
        setUsuarios((prev) => prev.map((u) => u.id === usuario.id ? { ...u, ativo: true } : u));
        showToast(`Usuário ${usuario.name} reativado.`, "success");
      } else if (tipo === "resetSenha" || tipo === "resetSenhaProprio") {
        res = await fetch(`/api/admin/usuarios/${usuario.id}/reset-senha`, { method: "POST" });
        json = await res.json();
        if (!json.success) throw new Error(json.error || "Erro ao resetar senha.");
        setSenhaGerada({ senha: json.data.senhaTemporaria, emailAlvo: json.data.emailAlvo, userId: usuario.id });
        showToast(`Senha de ${usuario.name} resetada com sucesso.`, "success");
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoadingAcao(null);
    }
  }

  function abrirModal(tipo, usuario) {
    setModal({ tipo, usuario });
  }

  /* ── Conteúdo do modal de confirmação ─────────────────────────── */

  function dadosModal() {
    if (!modal) return {};
    const { tipo, usuario } = modal;
    if (tipo === "desativar") return {
      titulo: "Desativar usuário",
      mensagem: `Tem certeza que deseja desativar "${usuario.name}" (${usuario.email})?\n\nO usuário não conseguirá mais acessar o portal.`,
      labelConfirmar: "Desativar",
      variant: "destrutivo",
    };
    if (tipo === "ativar") return {
      titulo: "Reativar usuário",
      mensagem: `Deseja reativar "${usuario.name}" (${usuario.email})?\n\nO usuário voltará a ter acesso ao portal.`,
      labelConfirmar: "Reativar",
      variant: "padrao",
    };
    if (tipo === "resetSenha") return {
      titulo: "Resetar senha",
      mensagem: `Será gerada uma nova senha temporária para "${usuario.name}" (${usuario.email}).\n\nA senha atual será invalidada imediatamente.`,
      labelConfirmar: "Resetar senha",
      variant: "padrao",
    };
    if (tipo === "resetSenhaProprio") return {
      titulo: "Resetar sua própria senha",
      mensagem: `Você está prestes a resetar a sua própria senha de acesso.\n\nUma nova senha temporária será gerada e a atual será invalidada. Você continuará logado até o fim da sessão, mas precisará usar a nova senha no próximo login.\n\nTem certeza que deseja continuar?`,
      labelConfirmar: "Sim, resetar minha senha",
      variant: "destrutivo",
    };
    return {};
  }

  const ehProprioUsuario = (id) => session?.user?.id === id;

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-torg-blue/10 rounded-lg">
            <Users size={22} className="text-torg-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-torg-dark">Usuários</h1>
            <p className="text-xs text-torg-gray mt-0.5">Gestão de acessos ao portal</p>
          </div>
        </div>
        <Link
          href="/admin/usuarios/novo"
          className="flex items-center gap-2 px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 transition-colors shadow-sm"
        >
          <UserPlus size={16} />
          Novo usuário
        </Link>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={filtroModulo}
            onChange={(e) => setFiltroModulo(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg text-torg-dark focus:outline-none focus:ring-2 focus:ring-torg-blue/30 bg-white"
          >
            {FILTRO_OPCOES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
        </div>

        <label className="flex items-center gap-2 text-sm text-torg-dark select-none cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 accent-torg-blue"
          />
          Mostrar inativos
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-torg-gray">
            {usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={carregar}
            disabled={loadingPagina}
            title="Recarregar"
            className="p-1.5 rounded-lg text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={15} className={loadingPagina ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loadingPagina ? (
          <div className="flex items-center justify-center py-16 text-torg-gray text-sm gap-2">
            <RefreshCw size={16} className="animate-spin" />
            Carregando usuários...
          </div>
        ) : erroCarregar ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <XCircle size={32} className="text-red-400" />
            <p className="text-sm text-red-500">{erroCarregar}</p>
            <button
              onClick={carregar}
              className="text-sm text-torg-blue hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users size={32} className="text-gray-300" />
            <p className="text-sm text-torg-gray">Nenhum usuário encontrado com os filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">Módulos</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">Setor</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">Verba</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-torg-gray uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {usuariosFiltrados.map((u) => {
                  const modsList = (u.modulos ?? []).map((m) => m.modulo ?? m);
                  const proprio = ehProprioUsuario(u.id);
                  const emAcao = loadingAcao === u.id;

                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors hover:bg-gray-50/50 ${!u.ativo ? "opacity-60" : ""}`}
                    >
                      {/* Nome */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-torg-dark">{u.name}</span>
                          {proprio && (
                            <span title="Você" className="text-[10px] bg-torg-blue/10 text-torg-blue px-1.5 py-0.5 rounded font-semibold tracking-wide">
                              VOCÊ
                            </span>
                          )}
                        </div>
                      </td>

                      {/* E-mail */}
                      <td className="px-4 py-3 text-torg-gray">{u.email}</td>

                      {/* Módulos */}
                      <td className="px-4 py-3">
                        {u.tipo === "ADMIN" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            <Shield size={11} />
                            Admin
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {modsList.length === 0 ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : modsList.map((m) => {
                              const info = MODULO_LABELS[m] ?? { label: m, cor: "bg-gray-100 text-gray-600" };
                              return (
                                <span key={m} className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${info.cor}`}>
                                  {info.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Setor */}
                      <td className="px-4 py-3 text-torg-gray text-xs">
                        {u.setor || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Verba */}
                      <td className="px-4 py-3 text-center">
                        {u.podeAlterarVerba ? (
                          <CheckCircle2 size={15} className="inline text-green-500" title="Pode alterar verba" />
                        ) : (
                          <XCircle size={15} className="inline text-gray-300" title="Não pode alterar verba" />
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${u.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Editar */}
                          <Link
                            href={`/admin/usuarios/${u.id}`}
                            title="Editar usuário"
                            className="p-1.5 rounded text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </Link>

                          {/* Resetar senha */}
                          <button
                            onClick={() => abrirModal(proprio ? "resetSenhaProprio" : "resetSenha", u)}
                            disabled={emAcao}
                            title="Resetar senha"
                            className="p-1.5 rounded text-torg-gray hover:text-torg-orange hover:bg-orange-50 transition-colors disabled:opacity-40"
                          >
                            <KeyRound size={15} />
                          </button>

                          {/* Ativar / Desativar */}
                          {u.ativo ? (
                            <button
                              onClick={() => abrirModal("desativar", u)}
                              disabled={emAcao || proprio}
                              title={proprio ? "Você não pode desativar sua própria conta" : "Desativar usuário"}
                              className="p-1.5 rounded text-torg-gray hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <XCircle size={15} />
                            </button>
                          ) : (
                            <button
                              onClick={() => abrirModal("ativar", u)}
                              disabled={emAcao}
                              title="Reativar usuário"
                              className="p-1.5 rounded text-torg-gray hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Senha gerada inline (após reset) */}
      {senhaGerada && (
        <SenhaReveladaInline
          senha={senhaGerada.senha}
          emailAlvo={senhaGerada.emailAlvo}
          onFechar={() => setSenhaGerada(null)}
        />
      )}

      {/* Modal de confirmação */}
      {modal && (
        <ConfirmModal
          open={!!modal}
          onClose={() => setModal(null)}
          onConfirm={() => executarAcao(modal.tipo, modal.usuario)}
          loading={loadingAcao === modal.usuario?.id}
          {...dadosModal()}
        />
      )}
    </div>
  );
}
