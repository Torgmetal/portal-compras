// Navegação PÚBLICA (token) do SGQ — só leitura, só pastas + PDFs. Pastas compartilhadas
// inteiras listam a pasta real; documentos avulsos são organizados numa árvore que RECRIA
// as pastas de origem (não ficam soltos na raiz).
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/sharepoint";
import { validarShare, caminhoPermitido, filhosDosDocumentos, registrarAcesso, SGQ_BASE } from "@/lib/sgq-share";

export const runtime = "nodejs";
export const maxDuration = 30;

const DRIVE = process.env.SHAREPOINT_DRIVE_ID;
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

async function metaArquivo(token, caminho) {
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE}/root:/${enc(`${SGQ_BASE}/${caminho}`)}?$select=lastModifiedDateTime,size`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const m = await r.json(); return { modificado: m.lastModifiedDateTime || null, tamanho: m.size ?? null }; }
  } catch { /* ignora */ }
  return {};
}

export async function GET(req, { params }) {
  const share = await validarShare(params.token);
  if (!share) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const sub = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  if (sub.split("/").some((x) => x === "..")) return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  if (!caminhoPermitido(sub, share)) return NextResponse.json({ error: "Esta pasta não faz parte do compartilhamento." }, { status: 403 });
  registrarAcesso(share.id);

  const resp = (itens) => NextResponse.json({ nome: share.nome, mensagem: share.mensagem || null, path: sub, itens });
  const ordena = (a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) : a.tipo === "folder" ? -1 : 1);
  const dentroDePasta = (share.pastas || []).some((P) => sub === P || sub.startsWith(P + "/"));

  // Dentro de uma pasta compartilhada INTEIRA → lista a pasta real (PDFs + subpastas não-obsoleto).
  if (sub !== "" && dentroDePasta) {
    let token;
    try { token = await getAccessToken(); }
    catch { return NextResponse.json({ nome: share.nome, path: sub, itens: [], erro: "Servidor indisponível." }, { status: 502 }); }
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE}/root:/${enc(`${SGQ_BASE}/${sub}`)}:/children?$select=name,folder,file,size,lastModifiedDateTime&$top=400`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return NextResponse.json({ nome: share.nome, path: sub, itens: [], erro: "Pasta não acessível." });
    const itens = ((await r.json()).value || [])
      .filter((it) => (it.folder && !/obsoleto/i.test(it.name)) || (it.file && /\.pdf$/i.test(it.name)))
      .map((it) => ({ nome: it.name, tipo: it.folder ? "folder" : "file", caminho: `${sub}/${it.name}`, modificado: it.lastModifiedDateTime || null, tamanho: it.size ?? null }))
      .sort(ordena);
    return resp(itens);
  }

  // Raiz OU navegação na árvore VIRTUAL dos documentos escolhidos (recria as pastas de origem).
  const { pastas: pastasVirt, arquivos } = filhosDosDocumentos(share.documentos || [], sub);
  const itens = [];
  const nomes = new Set();
  if (sub === "") {
    for (const P of [...(share.pastas || [])].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))) { itens.push({ nome: P, tipo: "folder", caminho: P }); nomes.add(P); }
  }
  for (const v of pastasVirt) if (!nomes.has(v.nome)) itens.push(v);

  // metadados dos arquivos (best-effort; evita muitos requests em seleções grandes)
  if (arquivos.length && arquivos.length <= 30) {
    let token = null;
    try { token = await getAccessToken(); } catch { /* segue sem metadados */ }
    const enriquecidos = token ? await Promise.all(arquivos.map(async (a) => ({ ...a, ...(await metaArquivo(token, a.caminho)) }))) : arquivos;
    itens.push(...enriquecidos);
  } else {
    itens.push(...arquivos);
  }

  itens.sort(ordena);
  return resp(itens);
}
