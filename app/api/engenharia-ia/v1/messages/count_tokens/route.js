// POST /api/engenharia-ia/v1/messages/count_tokens — mesmas checagens de aparelho e modelo, sem custo (lib/ia-portao.js).
import { atenderPortao } from "@/lib/ia-portao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  return atenderPortao(req, { contar: true });
}
