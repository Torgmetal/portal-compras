// POST /api/engenharia-ia/v1/messages — portão de IA da Engenharia (F1 do app Torg Engenharia).
// Pública para o middleware: autentica pelo token do APARELHO, não pela sessão. Regras em lib/ia-portao.js.
import { atenderPortao } from "@/lib/ia-portao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ⚠ resposta longa do Opus em stream: o teto de duração é o do plano da Vercel
export const maxDuration = 300;

export async function POST(req) {
  return atenderPortao(req);
}
