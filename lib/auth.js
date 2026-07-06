// Configuração do NextAuth (credentials provider — email + senha)
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 horas
  },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "E-mail ou CPF", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const ident = (credentials?.email || "").trim();
        const senha = credentials?.password || "";
        if (!ident || !senha) return null;

        let user = null;

        // Funcionário (autoatendimento) entra por CPF: 11 dígitos, sem "@".
        // Resolve o User pelo Funcionario vinculado (CPF pode estar salvo com
        // ou sem máscara — casamos as duas formas).
        const soDigitos = ident.replace(/\D/g, "");
        if (!ident.includes("@") && /^\d{11}$/.test(soDigitos)) {
          const cpfFmt = soDigitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
          const func = await prisma.funcionario.findFirst({
            where: { cpf: { in: [soDigitos, cpfFmt] } },
            select: { usuario: { include: { modulos: { select: { modulo: true } } } } },
          });
          user = func?.usuario || null;
        }

        // Usuários internos (e fallback) entram por e-mail.
        if (!user) {
          user = await prisma.user.findUnique({
            where: { email: ident.toLowerCase() },
            include: { modulos: { select: { modulo: true } } },
          });
        }

        if (!user || !user.ativo) return null;

        const valid = await bcrypt.compare(senha, user.password);
        if (!valid) return null;

        // Troca forçada: flag setada na criação/reset (1º acesso) OU senha do
        // funcionário expirada (90 dias desde a última troca).
        const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;
        const expirou =
          user.tipo === "FUNCIONARIO" &&
          user.senhaAlteradaEm &&
          Date.now() - new Date(user.senhaAlteradaEm).getTime() > NOVENTA_DIAS;
        const deveTrocarSenha = !!user.deveTrocarSenha || !!expirou;

        // Módulo Diretoria — acesso por allowlist (dono + AcessoDiretoria). Owner
        // hardcoded aqui pra evitar ciclo de import (lib/diretoria.js → session → auth).
        const emailNorm = user.email.toLowerCase();
        const diretoria = emailNorm === "vitor@torg.com.br"
          || !!(await prisma.acessoDiretoria.findUnique({ where: { email: emailNorm } }).catch(() => null));

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tipo: user.tipo,
          modulos: user.modulos.map((m) => m.modulo), // ex: ["COMERCIAL", "COMPRAS"]
          setor: user.setor,
          podeAlterarVerba: user.podeAlterarVerba ?? false,
          // Self-service: quando tipo=FUNCIONARIO, aponta pro registro de RH
          funcionarioId: user.funcionarioId ?? null,
          deveTrocarSenha,
          diretoria,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tipo = user.tipo;
        token.modulos = user.modulos ?? [];
        token.setor = user.setor;
        token.podeAlterarVerba = user.podeAlterarVerba ?? false;
        token.funcionarioId = user.funcionarioId ?? null;
        token.deveTrocarSenha = user.deveTrocarSenha ?? false;
        token.diretoria = user.diretoria ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.tipo = token.tipo;
        session.user.modulos = token.modulos ?? [];
        session.user.setor = token.setor;
        session.user.podeAlterarVerba = token.podeAlterarVerba ?? false;
        session.user.funcionarioId = token.funcionarioId ?? null;
        session.user.deveTrocarSenha = token.deveTrocarSenha ?? false;
        session.user.diretoria = token.diretoria ?? false;
        // Compatibilidade retroativa: campo `role` derivado para código legado
        // ainda não migrado (sidebars, páginas, helpers podeVerCompras etc.)
        // Será removido na Fase 5 quando todos os consumidores usarem tipo/modulos.
        session.user.role =
          token.tipo === "ADMIN" ? "ADMIN" : (token.modulos?.[0] ?? null);
      }
      return session;
    },
  },
  pages: {
    signIn: "/entrar",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// ─── Helpers legados (usam `role` derivado — mantidos para compatibilidade) ───

/** @deprecated Use user.tipo === "ADMIN" */
export const ROLES = {
  ADMIN: "ADMIN",
  COMERCIAL: "COMERCIAL",
  ENGENHARIA: "ENGENHARIA",
  ALMOXARIFADO: "ALMOXARIFADO",
  COMPRAS: "COMPRAS",
};

/** @deprecated Use user.tipo === "ADMIN" || user.modulos.includes("COMPRAS") */
export function podeVerCompras(role) {
  return ["ADMIN", "COMPRAS"].includes(role);
}

/** @deprecated Use user.tipo === "ADMIN" || user.modulos.includes("COMERCIAL") */
export function podeVerComercial(role) {
  return ["ADMIN", "COMERCIAL"].includes(role);
}

/** @deprecated Use user.tipo === "ADMIN" || user.modulos.some(m => [...].includes(m)) */
export function podeCriarRM(role) {
  return ["ADMIN", "ENGENHARIA", "ALMOXARIFADO", "COMPRAS"].includes(role);
}
