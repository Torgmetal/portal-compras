// GET — o cliente baixa UM documento escolhido do servidor (qualquer área do portal).
//
// ⚠ O TOKEN É DO PORTAL e a checagem é TRIPLA: o portal tem de estar publicado, a seção
// DOCUMENTOS tem de estar ligada, E o arquivo tem de estar na LISTA ESCOLHIDA daquela obra.
//
// A terceira é a que importa aqui. Nos certificados, "ser da OP" basta porque tudo que é da OP
// pode ser visto; na 2.5.5 NÃO — a pasta tem revisão obsoleta e arquivo de trabalho, e o que sai é
// só o que alguém marcou. Sem esta checagem, quem tivesse um link válido baixaria qualquer arquivo
// da pasta trocando o id na barra de endereço, incluindo o que foi deliberadamente não publicado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/sharepoint";
import { secoesDoPortal, tipoDoDocEng } from "@/lib/portal-cliente";
import { registrarAcesso } from "@/lib/portal-acesso";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;
const GRAPH = "https://graph.microsoft.com/v1.0";

export async function GET(req, { params }) {
  const { token } = await params;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new NextResponse("Documento não informado.", { status: 400 });

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return new NextResponse("Link inválido.", { status: 404 });
  if (!secoesDoPortal(portal).includes("DOCUMENTOS")) {
    return new NextResponse("Este documento não faz parte do portal desta obra.", { status: 403 });
  }

  // ⚠ PROCURA EM TODAS AS ÁREAS. Antes lia só `docsEngenharia`, o campo antigo de quando o portal
  // tinha uma lista só — e desde que a seleção passou a ser por área (`docsPorArea`), documento
  // escolhido para Compras, Qualidade, Planejamento ou Expedição chegava ao cliente como link que
  // devolve 404. A OP-112 é a única obra que ainda tem o campo antigo preenchido; ele continua
  // valendo como origem, mas quem manda é o mapa por área.
  const mapa = portal.docsPorArea || (portal.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
  let doc = null;
  let areaDoDoc = null;
  for (const [ar, lista] of Object.entries(mapa || {})) {
    const achado = (Array.isArray(lista) ? lista : []).find((d) => String(d.id) === String(id));
    if (achado) { doc = achado; areaDoDoc = ar; break; }
  }
  if (!doc && Array.isArray(portal.docsEngenharia)) {
    doc = portal.docsEngenharia.find((d) => String(d.id) === String(id)) || null;
    if (doc) areaDoDoc = "ENGENHARIA";
  }
  if (!doc) return new NextResponse("Documento não encontrado nesta obra.", { status: 404 });

  // ⚠⚠ A TRAVA DOS QUATRO TIPOS VALE AQUI TAMBÉM. Vitor (26/08/2026) restringiu a Engenharia ao
  // Modelo 3D, memorial de cálculo, ART e diagramas de montagem. Se a regra só existisse na
  // listagem, o que ficou de fora — a LPC crua da OP-112, com o peso item a item — continuaria a um
  // id de distância na barra de endereço, que é exatamente o furo que esta rota já fechava para a
  // pasta inteira.
  if (areaDoDoc === "ENGENHARIA" && !tipoDoDocEng(doc)) {
    return new NextResponse("Este documento não faz parte do portal desta obra.", { status: 403 });
  }

  try {
    const auth = { Authorization: `Bearer ${await getAccessToken()}` };
    const r = await fetch(`${GRAPH}/drives/${process.env.SHAREPOINT_DRIVE_ID}/items/${encodeURIComponent(id)}/content`, { headers: auth, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let buf = Buffer.from(await r.arrayBuffer());
    let nomeSaida = doc.nome;

    // ⚠⚠ PLANILHA SAI COM A CARA DA CASA. Vitor (03/09/2026): "vou precisar anexar algumas planilhas
    // em excel — vc consegue tratar elas e dar a nossa cara sem sair aquela porcaria que sai do
    // Tekla?". A lista exportada do Tekla chega com fonte de sistema, coluna estourada e nenhum
    // cabeçalho — e sai da nossa mão parecendo saída de máquina.
    //
    // ⚠ NENHUMA CÉLULA É MEXIDA: muda a moldura (capa, cabeçalho, larguras, rodapé ISO), não o dado.
    // E se a planilha não for uma tabela reconhecível, vai como veio — enfeitar o que não é tabela
    // estraga mais do que arruma.
    if (/\.(xlsx|xls|xlsm)$/i.test(doc.nome)) {
      try {
        const { padronizarPlanilha } = await import("@/lib/excel-padronizar");
        const tratada = await padronizarPlanilha(buf, {
          titulo: String(doc.nomeExibicao || doc.nome).replace(/\.[a-z]+$/i, ""),
          subtitulo: [`OP-${portal.opNumero}`, doc.pasta || ""].filter(Boolean).join(" · "),
          // ⚠ obra que não liberou o peso não recebe coluna de peso — nem no arquivo que veio da
          // pasta. É a mesma regra da LPC e da LE que o portal gera (Vitor: "peso é preço").
          semPeso: portal.mostrarPeso !== true,
        });
        if (tratada) { buf = tratada; nomeSaida = String(doc.nome).replace(/\.[a-z]+$/i, "") + ".xlsx"; }
      } catch { /* qualquer tropeço: entrega o arquivo original */ }
    }
    await prisma.portalCliente.update({ where: { id: portal.id }, data: { ultimoAcessoEm: new Date() } }).catch(() => {});
    await registrarAcesso(req, {
      portal, codigo: new URL(req.url).searchParams.get("d"), evento: "DOWNLOAD",
      documento: doc.nome, documentoId: String(id), secao: areaDoDoc || "ENGENHARIA",
    });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": nomeSaida !== doc.nome
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : r.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": dispArquivo(nomeSaida, "attachment"),
      },
    });
  } catch (e) {
    return new NextResponse(`Não consegui abrir o arquivo: ${e?.message || e}`, { status: 502 });
  }
}
