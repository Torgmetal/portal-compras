// Download PÚBLICO (token) de um PDF do SGQ — o portal busca no SharePoint e entrega
// (o externo não acessa o servidor direto). Restrito às pastas liberadas e a arquivos .pdf.
import { NextResponse } from "next/server";
import { downloadFileByPath } from "@/lib/sharepoint";
import { validarShare, arquivoPermitido, registrarAcesso, SGQ_BASE } from "@/lib/sgq-share";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req, { params }) {
  const share = await validarShare(params.token);
  if (!share) return new NextResponse("Link inválido ou expirado.", { status: 404 });

  const path = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  if (!path || path.split("/").some((x) => x === "..") || !/\.pdf$/i.test(path)) {
    return new NextResponse("Arquivo inválido.", { status: 400 });
  }
  if (!arquivoPermitido(path, share)) return new NextResponse("Acesso negado.", { status: 403 });

  registrarAcesso(share.id);

  try {
    const buf = await downloadFileByPath({ driveId: process.env.SHAREPOINT_DRIVE_ID, fullPath: `${SGQ_BASE}/${path}` });
    const nome = path.split("/").pop() || "documento.pdf";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }
}
