"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, AlertCircle, UserRound, KeyRound } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

const maskCpf = (v) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

export default function LoginColaborador() {
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const cpfDigitos = cpf.replace(/\D/g, "");

  const submit = async (e) => {
    e.preventDefault();
    if (carregando) return;
    setErro("");
    if (cpfDigitos.length !== 11) { setErro("Digite seu CPF completo (11 dígitos)."); return; }
    setCarregando(true);
    try {
      const res = await signIn("credentials", { email: cpfDigitos, password: senha, redirect: false });
      if (res?.error) {
        setErro("CPF ou senha inválidos.");
        setCarregando(false);
        return;
      }
      // Portal do colaborador é a própria /colaborador (recarrega já logado).
      window.location.href = "/colaborador";
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <TorgLogo size="md" />
          <div className="mt-4 w-12 h-12 rounded-2xl bg-torg-blue flex items-center justify-center text-white shadow-sm">
            <UserRound size={24} />
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-torg-dark tracking-tight text-center">Portal do Colaborador</h1>
          <p className="text-sm text-torg-gray mt-1 text-center">Entre com seu CPF e senha.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-torg-blue-100 shadow-sm p-6 space-y-4">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">CPF</label>
            <input
              type="text"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              required
              autoFocus
              autoComplete="username"
              placeholder="000.000.000-00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm tracking-wide focus:ring-2 focus:ring-torg-blue focus:border-transparent"
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
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-xs text-torg-gray text-center pt-1">
            Não tem senha? Fale com o RH.
          </p>
        </form>
      </div>
    </div>
  );
}
