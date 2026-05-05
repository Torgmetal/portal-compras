"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

export default function TrocarSenhaPage() {
  const [email, setEmail] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const senhaForteOk = novaSenha.length >= 8;
  const baterConfirmacao = novaSenha === confirmar && confirmar.length > 0;
  const podeEnviar = email && senhaAtual && senhaForteOk && baterConfirmacao && !salvando;

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso(false);
    if (!podeEnviar) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), senhaAtual, novaSenha, confirmar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao trocar a senha");
      setSucesso(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Imagem hero */}
      <div className="relative lg:w-1/2 h-48 lg:h-auto lg:min-h-screen overflow-hidden">
        <Image
          src="/obras/ponte-sunset.jpg"
          alt="Torg Metal"
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-torg-dark/85 via-torg-dark/40 to-torg-dark/10" />
        <div className="relative z-10 h-full flex flex-col justify-between p-8">
          <Link href="/" className="bg-white/95 backdrop-blur rounded-xl px-4 py-2 shadow-lg w-fit">
            <TorgLogo size="sm" />
          </Link>
          <div className="text-white max-w-md hidden lg:block">
            <p className="text-torg-orange font-semibold tracking-widest text-xs uppercase mb-3">
              Acesso interno
            </p>
            <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight">
              Trocar senha
            </h1>
            <p className="text-white/80 text-sm mt-3">
              Use sua senha atual pra definir uma nova.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7 space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound size={20} className="text-torg-blue" />
            <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">Trocar senha</h2>
          </div>
          <p className="text-sm text-torg-gray -mt-3">
            Digite seu email e a senha atual pra definir uma nova.
          </p>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {sucesso && (
            <div className="bg-torg-blue-50 border border-torg-blue-200 text-torg-dark text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-torg-blue" />
              <span>
                Senha trocada com sucesso!{" "}
                <Link href="/entrar" className="font-semibold text-torg-blue underline">
                  Entrar agora
                </Link>
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>

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

          <button
            type="submit"
            disabled={!podeEnviar}
            className="w-full py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando && <Loader2 size={16} className="animate-spin" />}
            {salvando ? "Salvando..." : "Trocar senha"}
          </button>

          <Link
            href="/entrar"
            className="block text-center text-sm text-torg-gray hover:text-torg-dark pt-2 border-t border-gray-100 inline-flex items-center gap-1 justify-center w-full"
          >
            <ArrowLeft size={14} /> Voltar pra tela de login
          </Link>
        </form>
      </div>
    </div>
  );
}
