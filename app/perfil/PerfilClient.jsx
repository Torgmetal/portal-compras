"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, KeyRound, User as UserIcon, Eye, EyeOff } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

const ROLE_LABELS = {
  ADMIN:        "Administrador",
  COMERCIAL:    "Comercial",
  COMPRAS:      "Compras",
  ENGENHARIA:   "Engenharia",
  ALMOXARIFADO: "Almoxarifado",
};

function homePorRole(role) {
  switch (role) {
    case "ADMIN":
    case "COMERCIAL":
      return "/comercial";
    case "COMPRAS":
      return "/compras";
    case "ENGENHARIA":
    case "ALMOXARIFADO":
      return "/rm";
    default:
      return "/";
  }
}

export default function PerfilClient({ user }) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const senhaForteOk = novaSenha.length >= 8;
  const baterConfirmacao = novaSenha === confirmar && confirmar.length > 0;
  const podeEnviar = senhaAtual && senhaForteOk && baterConfirmacao && !salvando;

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso(false);
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha, confirmar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao trocar a senha");
      setSucesso(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
      // Por seguranca, desloga depois de 2s pra obrigar novo login com a senha nova
      setTimeout(() => signOut({ callbackUrl: "/entrar" }), 2000);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const homeHref = homePorRole(user.role);

  return (
    <div className="min-h-screen bg-torg-blue-50/30 flex flex-col">
      <header className="bg-white border-b border-torg-blue-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={homeHref} className="flex items-center gap-3">
            <TorgLogo size="sm" />
            <span className="text-xs text-torg-gray hidden sm:inline">Workspace Torg</span>
          </Link>
          <Link
            href={homeHref}
            className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-torg-dark tracking-tight">Meu perfil</h1>
          <p className="text-sm text-torg-gray mt-1">
            Veja seus dados de acesso e troque sua senha.
          </p>
        </div>

        {/* Card do usuario */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-torg-blue-50 flex items-center justify-center flex-shrink-0">
              <UserIcon size={26} className="text-torg-blue" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-torg-dark truncate">{user.name}</p>
              <p className="text-sm text-torg-gray truncate">{user.email}</p>
              <p className="text-[10px] text-torg-gray uppercase tracking-wide mt-0.5">
                {ROLE_LABELS[user.role] || user.role}
                {user.setor ? ` · ${user.setor}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Card de troca de senha */}
        <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-torg-blue" />
            <h2 className="text-lg font-semibold text-torg-dark">Trocar senha</h2>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {sucesso && (
            <div className="bg-torg-blue-50 border border-torg-blue-200 text-torg-dark text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-torg-blue" />
              <span>Senha trocada com sucesso. Você será deslogado em instantes — entre de novo com a nova senha.</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Senha atual</label>
            <input
              type={mostrar ? "text" : "password"}
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Nova senha</label>
            <input
              type={mostrar ? "text" : "password"}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
            {novaSenha.length > 0 && (
              <p className={`text-[11px] mt-1 ${senhaForteOk ? "text-torg-blue" : "text-torg-orange-700"}`}>
                {senhaForteOk ? "✓ tamanho OK" : `✗ precisa de ${8 - novaSenha.length} caractere(s) a mais`}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Confirmar nova senha</label>
            <input
              type={mostrar ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
            {confirmar.length > 0 && (
              <p className={`text-[11px] mt-1 ${baterConfirmacao ? "text-torg-blue" : "text-torg-orange-700"}`}>
                {baterConfirmacao ? "✓ confirmação bate" : "✗ não bate com a nova senha"}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            className="text-xs text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"
          >
            {mostrar ? <EyeOff size={12} /> : <Eye size={12} />}
            {mostrar ? "Esconder senhas" : "Mostrar senhas"}
          </button>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={!podeEnviar}
              className="px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando && <Loader2 size={16} className="animate-spin" />}
              {salvando ? "Salvando..." : "Trocar senha"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
