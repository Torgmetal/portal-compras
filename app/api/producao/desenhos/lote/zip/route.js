// ZIP do lote de desenhos, organizado por DESTINO DE IMPRESSÃO.
// POST { opNumero, arquivos: [{ itemId, nome, formato }] }
//
// Vitor (19/08): "faz um download dos arquivos, salva em pastas separadas na pasta download do
// usuário, assim ele consegue já imprimir em duas impressoras ao mesmo tempo — a folha A2 vamos
// fazer na plotter, já a A3 e A4 são na outra impressora".
//
// ⚠ As pastas são por MÁQUINA, não por formato: quem imprime não escolhe papel, escolhe
// impressora. A1/A2 vão pra plotter e A3/A4 pra impressora comum, então o zip sai com duas
// pastas e a pessoa arrasta uma pra cada fila. O formato continua no nome do arquivo.
import { NextResponse } from "next/server";
import { z } from "zod";
import PizZip from "pizzip";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";
import { dataHoraBR } from "@/lib/data-br";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // baixar dezenas de A1 do SharePoint

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];

const schema = z.object({
  opNumero: z.string().min(1),
  arquivos: z.array(z.object({
    itemId: z.string().regex(/^[A-Za-z0-9_\-!.]+$/, "itemId inválido"),
    nome: z.string().min(1),
    formato: z.string().nullable().optional(),
    // ⚠ a bancada que vai montar aquele conjunto — vira a pasta de cima no ZIP. Vitor
    // (01/09/2026): "separa na pasta da obra as pastas com os conjuntos de cada bancada, e criar o
    // zip para poder imprimir e entregar para o encarregado". Sem isso o encarregado recebe um maço
    // único e reparte na mão, que é justamente o trabalho que a tela acabou de fazer.
    pasta: z.string().max(60).nullable().optional(),
  // ⚠⚠ O LIMITE ERA 20 E O ERRO NÃO DIZIA ISSO. Vitor (01/09/2026): "tentei baixar 500 marcas da
  // OP 113 e não criou a pasta de download". O Zod recusava o corpo e a tela mostrava "erro ao
  // montar o ZIP" — sem falar em limite, sem dizer quantos cabem. Agora o cliente FATIA em lotes
  // (ver baixarZipLote) e este teto vale por lote.
  //
  // ⚠ POR QUE NÃO É ILIMITADO: cada A1 do SharePoint é baixado inteiro para a memória da função e
  // o zip é montado lá dentro. Quinhentos desenhos de uma vez estouram a memória e o tempo da
  // função — e o erro apareceria como um 502 sem explicação, que é pior que um limite claro.
  })).min(1).max(60),
});

// A1/A2 = plotter; A3/A4 = impressora comum. Formato desconhecido vai pra plotter: errar pro lado
// da folha grande estraga uma folha, errar pro outro corta o desenho.
function destino(formato) {
  return /^A[34]$/i.test(String(formato || "")) ? "IMPRESSORA (A3-A4)" : "PLOTTER (A1-A2)";
}

const limpo = (s) => String(s).replace(/[^\w. \-()+]/g, "_");

export async function POST(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const zip = new PizZip();
  const falhas = [];

  for (const a of body.arquivos) {
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${a.itemId}/content`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // ⚠ BANCADA POR FORA, IMPRESSORA POR DENTRO. Quem opera o ZIP é o encarregado: ele abre a
      // pasta da bancada e manda cada subpasta para a fila certa. Invertendo, ele teria de entrar
      // em duas pastas para juntar o maço de UMA bancada.
      const caminho = a.pasta
        ? `${limpo(a.pasta)}/${destino(a.formato)}/${limpo(a.nome)}`
        : `${destino(a.formato)}/${limpo(a.nome)}`;
      zip.file(caminho, Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      falhas.push(`${a.nome}: ${e?.message || "falhou"}`);
    }
  }

  if (!Object.keys(zip.files).length) {
    return NextResponse.json({ error: `Nenhum arquivo pôde ser baixado. ${falhas.join(" · ")}` }, { status: 502 });
  }
  // o que falhou vira um aviso DENTRO do zip: quem baixa não vê resposta de erro nenhuma
  if (falhas.length) zip.file("FALTOU BAIXAR.txt", `Não foi possível baixar:\n\n${falhas.join("\n")}\n`);

  const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  const carimbo = dataHoraBR(new Date()).replace(/\/\d{4}/, "").replace(/[/:]/g, "-");
  const nome = limpo(`OP-${body.opNumero} - desenhos ${carimbo}.zip`);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": dispArquivo(nome, "attachment"),
      "Content-Length": String(buf.length),
    },
  });
}
