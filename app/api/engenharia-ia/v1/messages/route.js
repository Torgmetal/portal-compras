// POST /api/engenharia-ia/v1/messages — portão de IA da Engenharia (F1 do app Torg Engenharia).
// Pública para o middleware: autentica pelo token do APARELHO, não pela sessão. Regras em lib/ia-portao.js.
import { atenderPortao } from "@/lib/ia-portao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ⚠ resposta longa em stream: o teto é o do plano da Vercel (Pro: 800 s). Com 300 s a IA foi cortada no meio de um
// arquivo de modelo grande (spec de tesoura, 17/10/2026: "Task timed out after 300 seconds" → "Sem conexão com o portal").
export const maxDuration = 800;

export async function POST(req) {
  return atenderPortao(req);
}
