"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, AlertCircle, HardHat, KeyRound, Mail } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

/**
 * Entrada do PORTAL QUALIDADE FÁBRICA.
 *
 * Porta separada de propósito. Vitor (21/08/2026): "não acho que devemos vincular o portal dos
 * funcionários, vamos fazer algo separado" — o portal do colaborador é RH (holerite, ponto), e dois
 * dos cinco inspetores são EXTERNOS, sem cadastro de funcionário.
 *
 * ⚠ Separado é a PORTA, não a autenticação: por baixo é o mesmo login do portal. Dois sistemas de
 * senha seriam dois lugares pra cortar acesso no dia que alguém sai — e é o esquecido que continua
 * assinando evidência.
 */
export default function LoginCampo() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (carregando) return;
    setErro("");
    if (!email.trim() || !senha) { setErro("Preencha usuário e senha."); return; }
    setCarregando(true);
    try {
      const res = await signIn("credentials", { email: email.trim(), password: senha, redirect: false });
      if (res?.error) { setErro("Usuário ou senha inválidos."); setCarregando(false); return; }
      window.location.href = "/campo";
    } catch {
      setErro("Sem conexão. Tente de novo.");
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <TorgLogo size="md" />
          <div className="mt-4 w-14 h-14 rounded-2xl bg-torg-blue flex items-center justify-center text-white shadow-sm">
            <HardHat size={28} />
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-torg-dark tracking-tight text-center">Qualidade Fábrica</h1>
          <p className="text-sm text-torg-gray mt-1 text-center">Registro de inspeção pelo celular.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-torg-gray mb-1">Usuário</span>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
              {/* teclado sem maiúscula automática e sem corretor: e-mail digitado errado é o
                  motivo nº 1 de "não consigo entrar" em tela de celular */}
              <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu.email@torg.com.br"
                className="w-full text-base border border-gray-200 rounded-xl pl-9 pr-3 py-3 focus:border-torg-blue outline-none" />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-torg-gray mb-1">Senha</span>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                className="w-full text-base border border-gray-200 rounded-xl pl-9 pr-3 py-3 focus:border-torg-blue outline-none" />
            </div>
          </label>

          {erro && (
            <p className="text-sm text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={14} /> {erro}</p>
          )}

          <button type="submit" disabled={carregando}
            className="w-full bg-torg-blue hover:bg-torg-dark text-white font-semibold rounded-xl py-3.5 text-base inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {carregando && <Loader2 size={16} className="animate-spin" />} Entrar
          </button>

          <p className="text-[11px] text-torg-gray text-center pt-1">
            Este acesso fica conectado por 7 dias neste aparelho.
          </p>
        </form>
      </div>
    </div>
  );
}
