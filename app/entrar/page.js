"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";
import WorkspaceAcesso from "@/components/WorkspaceAcesso";
import { destinoLogin } from "@/lib/destino-login";

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (carregando) return; // bloqueia duplo-clique
    setErro("");
    setCarregando(true);
    try {
      const res = await signIn("credentials", {
        email,
        password: senha,
        redirect: false,
      });
      if (res?.error) {
        setErro("Email ou senha inválidos.");
        setCarregando(false);
        return;
      }
      const resposta = await fetch("/api/auth/session");
      if (!resposta.ok) throw new Error("Sessão indisponível");
      const sessao = await resposta.json();
      if (!sessao?.user) throw new Error("Sessão indisponível");
      window.location.href = destinoLogin(sessao.user, callbackUrl, window.location.origin);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      setCarregando(false);
    }
  };

  return (
    <WorkspaceAcesso>
        <form onSubmit={submit} className="w-full max-w-[380px] bg-white rounded-2xl border border-slate-200 shadow-sm p-7 space-y-5">
          <div>
            <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight">Entre no Workspace</h1>
            <p className="text-sm text-torg-gray mt-1">Use seu e-mail e senha para acessar.</p>
          </div>

          {erro && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-torg-dark mb-1">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              placeholder="seu@email.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-torg-dark mb-1">Senha</label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {carregando && <Loader2 size={16} className="animate-spin" />}
            {carregando ? "Entrando..." : "Entrar"}
            {!carregando && <ArrowRight size={16} aria-hidden="true" />}
          </button>

          <div className="pt-3 border-t border-gray-100 space-y-2 text-center">
            <Link
              href="/esqueci-senha"
              className="block text-sm text-torg-blue hover:text-torg-blue-700 font-medium"
            >
              Esqueci minha senha
            </Link>
            <Link
              href="/colaborador"
              className="block text-sm text-torg-gray hover:text-torg-dark"
            >
              É funcionário? Acesse o <span className="font-medium">Portal do Colaborador</span>
            </Link>
            <p className="text-xs text-torg-gray">
              Não tem acesso? Fale com o administrador do portal.
            </p>
          </div>
        </form>
    </WorkspaceAcesso>
  );
}

export default function EntrarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-torg-gray">Carregando...</div>}>
      <LoginForm />
    </Suspense>
  );
}
