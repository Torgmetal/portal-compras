// GET /api/engenharia/listas/destinatarios — usuários ativos da Torg (equipe
// interna, exclui funcionário self-service) pro seletor de quem recebe o aviso
// de revisão de lista. Mesmo critério do seletor de CC dos relatórios.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SEM_EXTERNOS } from "@/lib/usuarios-internos";

export const runtime = "nodejs";

// ⚠⚠ SÓ QUEM TRABALHA COM A LISTA. Vitor (02/09/2026): "precisamos tirar o e-mail do Caio,
// comercial, financeiro, RH, pois não precisam receber esses e-mails".
//
// A lista era "todo usuário ativo da Torg" — 21 pessoas para um aviso que interessa a sete setores.
// Aviso que chega a quem não usa é o que ensina todo mundo a ignorar o próximo, inclusive quem
// precisava ler.
//
// ⚠ POR SETOR, NÃO POR NOME: assim a regra continua valendo quando alguém entrar ou sair, sem
// ninguém lembrar de mexer aqui. Comparado sem acento e em caixa alta porque o cadastro tem
// "Produção" e "Planejamento" escritos como vierem.
const SETORES_QUE_USAM_A_LISTA = ["ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMPRAS", "ALMOXARIFADO", "QUALIDADE", "DIRETORIA"];
const chaveSetor = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

export async function GET() {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const users = await prisma.user.findMany({
    where: { ativo: true, ...SEM_EXTERNOS, tipo: { not: "FUNCIONARIO" } },
    select: { name: true, email: true, setor: true },
    orderBy: [{ setor: "asc" }, { name: "asc" }],
  });
  const seen = new Set();
  const destinatarios = [];
  for (const u of users) {
    const e = (u.email || "").trim().toLowerCase();
    if (!e || e.endsWith("@funcionario.torg") || seen.has(e)) continue;
    // ⚠ setor fora da lista não entra. E sem setor também não: conta sem área definida não tem como
    // ser "quem precisa saber", e no cadastro de hoje é justamente o caso do cliente que entrou
    // como usuário interno (pinho.davi@tmsa.ind.br) — endereço de FORA recebendo aviso nosso.
    if (!SETORES_QUE_USAM_A_LISTA.includes(chaveSetor(u.setor))) continue;
    seen.add(e);
    destinatarios.push({ nome: u.name || u.email, email: u.email, setor: u.setor || null });
  }
  return NextResponse.json({ destinatarios });
}
