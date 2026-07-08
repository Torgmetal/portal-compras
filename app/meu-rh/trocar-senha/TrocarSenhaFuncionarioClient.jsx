"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

export default function TrocarSenhaFuncionarioClient({ nome, obrigatoria }) {
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
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/meu-rh/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha, confirmar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao trocar a senha");
      setSucesso(true);
      // Sai e volta pro login — o token de sessão recarrega sem a exigência de troca.
      setTimeout(() => signOut({ callbackUrl: "/colaborador" }), 1500);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7 space-y-5">
        <div className="flex items-center justify-between">
          <TorgLogo size="sm" />
          <KeyRound size={20} className="text-torg-blue" />
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">
            {obrigatoria ? "Defina uma nova senha" : "Trocar senha"}
          </h2>
          <p className="text-sm text-torg-gray mt-1">Olá, {nome}.</p>
        </div>

        {obrigatoria && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
            <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
            <span>Por segurança, você precisa trocar a senha provisória antes de continuar.</span>
          </div>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {sucesso && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <span>Senha trocada! Redirecionando para o login…</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">
            {obrigatoria ? "Senha provisória (atual)" : "Senha atual"}
          </label>
          <input
            type={mostrar ? "text" : "password"}
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            required
            autoFocus
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

        <button
          type="submit"
          disabled={!podeEnviar}
          className="w-full py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando && <Loader2 size={16} className="animate-spin" />}
          {salvando ? "Salvando..." : "Trocar senha"}
        </button>

        {!obrigatoria && (
          <Link
            href="/meu-rh"
            className="text-center text-sm text-torg-gray hover:text-torg-dark pt-2 border-t border-gray-100 inline-flex items-center gap-1 justify-center w-full"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        )}
      </form>
    </div>
  );
}
