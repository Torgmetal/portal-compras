"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, Mail, KeyRound, ShieldCheck } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

export default function EsqueciSenhaPage() {
  // Etapas: 1 = email, 2 = código, 3 = nova senha, 4 = sucesso
  const [etapa, setEtapa] = useState(1);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Etapa 1 — Enviar código para o email
  async function enviarCodigo(e) {
    e.preventDefault();
    if (carregando) return;
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.success) {
        setErro(json.error || "Erro ao enviar código.");
        return;
      }
      setEtapa(2);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  // Etapa 2 — Verificar código
  async function verificarCodigo(e) {
    e.preventDefault();
    if (carregando) return;
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/esqueci-senha?acao=verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, codigo }),
      });
      const json = await res.json();
      if (!json.success) {
        setErro(json.error || "Código inválido.");
        return;
      }
      setEtapa(3);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  // Etapa 3 — Definir nova senha
  async function resetarSenha(e) {
    e.preventDefault();
    if (carregando) return;
    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }
    if (novaSenha.length < 8) {
      setErro("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/esqueci-senha?acao=resetar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, codigo, novaSenha, confirmarSenha }),
      });
      const json = await res.json();
      if (!json.success) {
        setErro(json.error || "Erro ao alterar senha.");
        return;
      }
      setEtapa(4);
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  // Indicador de etapas
  const etapas = [
    { n: 1, label: "Email", icon: Mail },
    { n: 2, label: "Código", icon: ShieldCheck },
    { n: 3, label: "Nova senha", icon: KeyRound },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Hero */}
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
              Recuperar acesso
            </p>
            <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight">
              Esqueci minha senha
            </h1>
            <p className="text-white/80 text-sm mt-3">
              Enviaremos um código de verificação para o seu email cadastrado.
            </p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md">

          {/* Progresso das etapas */}
          {etapa < 4 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {etapas.map((et) => {
                const Icon = et.icon;
                const ativa = etapa === et.n;
                const concluida = etapa > et.n;
                return (
                  <div key={et.n} className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      ativa ? "bg-torg-blue text-white" :
                      concluida ? "bg-green-100 text-green-700" :
                      "bg-gray-100 text-gray-400"
                    }`}>
                      {concluida ? <CheckCircle2 size={13} /> : <Icon size={13} />}
                      {et.label}
                    </div>
                    {et.n < 3 && (
                      <div className={`w-6 h-0.5 rounded ${concluida ? "bg-green-300" : "bg-gray-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Etapa 1 — Email */}
          {etapa === 1 && (
            <form onSubmit={enviarCodigo} className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7 space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">Recuperar senha</h2>
                <p className="text-sm text-torg-gray mt-1">
                  Informe o email cadastrado no portal. Enviaremos um código de verificação.
                </p>
              </div>
              {erro && <MsgErro msg={erro} />}
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
                />
              </div>
              <BotaoSubmit carregando={carregando} texto="Enviar código" textoLoading="Enviando..." />
              <LinkVoltar />
            </form>
          )}

          {/* Etapa 2 — Código */}
          {etapa === 2 && (
            <form onSubmit={verificarCodigo} className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7 space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">Código enviado</h2>
                <p className="text-sm text-torg-gray mt-1">
                  Verifique sua caixa de entrada e insira o código de 6 dígitos enviado para <strong className="text-torg-dark">{email}</strong>.
                </p>
              </div>
              {erro && <MsgErro msg={erro} />}
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Código de verificação</label>
                <input
                  type="text"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  inputMode="numeric"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center tracking-[0.5em] font-mono text-lg focus:ring-2 focus:ring-torg-blue focus:border-transparent"
                />
                <p className="text-xs text-torg-gray mt-1.5">O código expira em 15 minutos.</p>
              </div>
              <BotaoSubmit carregando={carregando} texto="Verificar" textoLoading="Verificando..." />
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setEtapa(1); setErro(""); setCodigo(""); }}
                  className="text-sm text-torg-blue hover:text-torg-blue-700 font-medium"
                >
                  Não recebi o código — reenviar
                </button>
              </div>
            </form>
          )}

          {/* Etapa 3 — Nova senha */}
          {etapa === 3 && (
            <form onSubmit={resetarSenha} className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-7 space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight">Nova senha</h2>
                <p className="text-sm text-torg-gray mt-1">
                  Código verificado com sucesso. Defina sua nova senha de acesso.
                </p>
              </div>
              {erro && <MsgErro msg={erro} />}
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Nova senha</label>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  autoFocus
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-torg-dark mb-1">Confirmar senha</label>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
                />
                <p className="text-xs text-torg-gray mt-1.5">Mínimo de 8 caracteres.</p>
              </div>
              <BotaoSubmit carregando={carregando} texto="Alterar senha" textoLoading="Alterando..." />
            </form>
          )}

          {/* Etapa 4 — Sucesso */}
          {etapa === 4 && (
            <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-7 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-torg-dark">Senha alterada!</h2>
              <p className="text-sm text-torg-gray">
                Sua senha foi atualizada com sucesso. Agora você pode entrar com a nova senha.
              </p>
              <Link
                href="/entrar"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold text-sm"
              >
                Ir para o login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componentes auxiliares ────────────────────────────────────

function MsgErro({ msg }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

function BotaoSubmit({ carregando, texto, textoLoading }) {
  return (
    <button
      type="submit"
      disabled={carregando}
      className="w-full py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
    >
      {carregando && <Loader2 size={16} className="animate-spin" />}
      {carregando ? textoLoading : texto}
    </button>
  );
}

function LinkVoltar() {
  return (
    <div className="pt-3 border-t border-gray-100 text-center">
      <Link
        href="/entrar"
        className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:text-torg-blue-700 font-medium"
      >
        <ArrowLeft size={14} /> Voltar para o login
      </Link>
    </div>
  );
}
