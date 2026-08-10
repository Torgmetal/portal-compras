// Navegação PÚBLICA (token) das pastas liberadas do SGQ — só leitura, só pastas + PDFs.
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/sharepoint";
import { validarShare, caminhoPermitido, registrarAcesso, SGQ_BASE } from "@/lib/sgq-share";

export const runtime = "nodejs";
export const maxDuration = 30;

const DRIVE = process.env.SHAREPOINT_DRIVE_ID;
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export async function GET(req, { params }) {
  const share = await validarShare(params.token);
  if (!share) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const sub = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  if (sub.split("/").some((x) => x === "..")) return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  if (!caminhoPermitido(sub, share.pastas)) return NextResponse.json({ error: "Esta pasta não faz parte do compartilhamento." }, { status: 403 });

  registrarAcesso(share.id);

  // Raiz → pastas liberadas (navegáveis) + documentos específicos escolhidos (abrem direto).
  if (sub === "") {
    const pastas = [...(share.pastas || [])].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
      .map((P) => ({ nome: P, tipo: "folder", caminho: P }));
    const docs = [...(share.documentos || [])].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
      .map((d) => ({ nome: d.split("/").pop(), tipo: "file", caminho: d, secao: d.split("/")[0] || null }));
    return NextResponse.json({ nome: share.nome, mensagem: share.mensagem || null, path: "", itens: [...pastas, ...docs] });
  }

  let token;
  try { token = await getAccessToken(); }
  catch { return NextResponse.json({ nome: share.nome, path: sub, itens: [], erro: "Servidor indisponível." }, { status: 502 }); }

  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE}/root:/${enc(`${SGQ_BASE}/${sub}`)}:/children?$select=name,folder,file,size,lastModifiedDateTime&$top=400`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return NextResponse.json({ nome: share.nome, path: sub, itens: [], erro: "Pasta não acessível." });

  const itens = ((await r.json()).value || [])
    // só subpastas (não OBSOLETO) e PDFs — nada de editáveis (Word/Excel)
    .filter((it) => (it.folder && !/obsoleto/i.test(it.name)) || (it.file && /\.pdf$/i.test(it.name)))
    .map((it) => ({
      nome: it.name,
      tipo: it.folder ? "folder" : "file",
      caminho: `${sub}/${it.name}`,
      modificado: it.lastModifiedDateTime || null,
      tamanho: it.size ?? null,
    }))
    .sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) : a.tipo === "folder" ? -1 : 1));

  return NextResponse.json({ nome: share.nome, mensagem: share.mensagem || null, path: sub, itens });
}
