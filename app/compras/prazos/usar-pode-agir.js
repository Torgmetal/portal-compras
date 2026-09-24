"use client";
import { useSession } from "next-auth/react";

// ─── QUEM SÓ OLHA, E QUEM MEXE ───────────────────────────────────────────────
//
// Matheus (24/09/2026): *"libere para o usuário almoxarifado@torg.com.br o acesso a aba Prazos das
// RMs para ele conseguir VER quando chega os materiais"*.
//
// ⚠⚠⚠ "VER" É A PALAVRA QUE DECIDE ESTE ARQUIVO. A tela faz QUATRO coisas, e só uma é ver:
//   1. lista os pedidos por RM com a previsão  ← é isto que o almoxarifado precisa
//   2. **Sincronizar** — bate no Omie, divide a trava com os crons e pode disparar o
//      MISUSE_API_PROCESS, que bloqueia a conta inteira por ~30 minutos
//   3. **Cobrar atrasados** — MANDA E-MAIL para o fornecedor, e e-mail não tem desfazer
//   4. **Aprovar/recusar** a data proposta — muda o prazo E avisa o fornecedor por e-mail
//
// As três últimas são atos para FORA da empresa, feitos em nome do Compras. Liberar a tela inteira
// para quem pediu para acompanhar chegada de material daria ao almoxarife o poder de cobrar
// fornecedor e de aceitar remarcação de prazo — coisas que ninguém pediu e que não se desfazem.
//
// ⚠⚠ E ESCONDER É OBRIGAÇÃO, NÃO ENFEITE. As rotas de escrita continuam exigindo COMPRAS; se os
// botões ficassem à vista, o almoxarife clicaria e tomaria um 403 sem explicação nenhuma — a mesma
// lição da opção "Data de entrega" de ontem.

/**
 * Espelha `requireRole(["ADMIN", "COMPRAS"])` de `lib/session.js`: ADMIN é TIPO e passa em tudo; o
 * resto precisa do MÓDULO. Inventar a conta aqui faria a tela e o servidor discordarem.
 */
export function usarPodeAgir() {
  const { data } = useSession();
  const u = data?.user;
  return u?.tipo === "ADMIN" || (u?.modulos ?? []).includes("COMPRAS");
}
