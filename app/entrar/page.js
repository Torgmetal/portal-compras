"use client";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

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
    case "PRODUCAO":
      return "/producao";
    case "FINANCEIRO":
      return "/financeiro";
    default:
      return "/";
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const res = await signIn("credentials", {
      email,
      password: senha,
      redirect: false,
    });
    if (res?.error) {
      setCarregando(false);
      setErro("Email ou senha inválidos.");
      return;
    }
    // Lê a sessão pra descobrir o role e redirecionar pro portal certo
    let destino = callbackUrl;
    if (!destino) {
      try {
        const s = await fetch("/api/auth/session").then((r) => r.json());
        destino = homePorRole(s?.user?.role);
      } catch {
        destino = "/";
      }
    }
    setCarregando(false);
    router.push(destino);
    router.refresh();
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
              Workspace Torg
            </h1>
            <p className="text-white/80 text-sm mt-3">
              Portais de Comercial, Compras e Requisições integrados.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7 space-y-5">
          <div>
            <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">Entrar</h2>
            <p className="text-sm text-torg-gray mt-1">Use seu email e senha cadastrados.</p>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
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
            <label className="block text-sm font-medium text-torg-dark mb-1">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {carregando && <Loader2 size={16} className="animate-spin" />}
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          <div className="pt-3 border-t border-gray-100 space-y-2 text-center">
            <Link
              href="/trocar-senha"
              className="block text-sm text-torg-blue hover:text-torg-blue-700 font-medium"
            >
              Trocar senha
            </Link>
            <p className="text-xs text-torg-gray">
              Não tem acesso? Fale com o administrador do portal.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EntrarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-torg-gray">Carregando...</div>}>
      <LoginForm />
    </Suspense>
  );
}
