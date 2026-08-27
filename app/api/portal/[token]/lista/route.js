// A LPC e a LE que o CLIENTE baixa, e o "já vi essa revisão".
//
// Vitor (22/08/2026): "a LE e LPC deve ter permissão para o cliente baixar e nos casos de uma
// revisão disponibilizar uma lista nova para Download".
//
// ⚠ A PLANILHA É GERADA AQUI, NO SERVIDOR, e não no navegador dele. Não é detalhe de arquitetura:
// é onde a regra do peso se aplica de verdade. Se o arquivo fosse montado no cliente, a lista
// completa — com peso — teria de trafegar até lá, e a escolha de não divulgar o peso viraria
// enfeite. Aqui, quando a obra não liberou, a coluna simplesmente não existe no arquivo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { LISTAS, pecasDaLista, sincronizarRevisao } from "@/lib/portal-listas";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais } from "@/lib/excel-relatorio";

export const runtime = "nodejs";
export const maxDuration = 60;

async function abrirPortal(token, chave) {
  if (!LISTAS[chave]) return { erro: new NextResponse("Lista inválida.", { status: 400 }) };
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return { erro: new NextResponse("Link inválido.", { status: 404 }) };
  // ⚠ a SEÇÃO tem de estar ligada. Desligar a LPC na configuração precisa fechar também o
  // download, senão o botão some da tela e o arquivo continua ao alcance de quem souber o endereço.
  if (!secoesDoPortal(portal).includes(LISTAS[chave].secao))
    return { erro: new NextResponse("Esta lista não faz parte do portal desta obra.", { status: 403 }) };
  const op = await prisma.oP.findFirst({
    where: { numero: portal.opNumero },
    select: { id: true, numero: true, cliente: true, obra: true, refCliente: true },
  });
  if (!op) return { erro: new NextResponse("Obra não encontrada.", { status: 404 }) };
  return { portal, op };
}

export async function GET(req, { params }) {
  const { token } = await params;
  const chave = String(new URL(req.url).searchParams.get("fonte") || "").toUpperCase();
  const { erro, portal, op } = await abrirPortal(token, chave);
  if (erro) return erro;

  const cfg = LISTAS[chave];
  const comPeso = portal.mostrarPeso === true;
  const pecas = await pecasDaLista(prisma, op.id, chave);
  if (!pecas.length) return new NextResponse("Esta lista ainda não tem itens.", { status: 404 });

  const rev = await sincronizarRevisao(prisma, { opId: op.id, opNumero: portal.opNumero, chave, pecas }).catch(() => null);
  const revisao = rev?.rotulo || (rev ? `Revisao ${rev.seq}` : "00");

  const headers = ["Marca", "Descricao", "Material", "Qtd.", ...(comPeso ? ["Peso (kg)"] : [])];
  // ⚠⚠ SÓ O NÍVEL 0 SOMA. Com as subpeças na lista, somar tudo conta o MESMO aço duas vezes — o
  // peso do conjunto já é a soma dos croquis dele (regra da casa: "somar PecaConjunto cru dobra").
  const totalKg = Math.round(pecas.filter((p) => !p.nivel).reduce((s, p) => s + (p.pesoTotalKg || 0), 0));
  // ⚠ e o TOTAL de itens conta só os conjuntos: "197 itens" ao lado de um peso de 47 conjuntos
  // faria os dois números parecerem errados. A planilha traz as 197 linhas do mesmo jeito.
  const totalItens = pecas.filter((p) => !p.nivel).length || pecas.length;
  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: cfg.nome,
    subtitulo: `OP-${op.numero} — ${op.obra || ""}${op.refCliente ? ` (Ref. ${op.refCliente})` : ""}`,
    kpis: [
      `Cliente: ${op.cliente || "—"}  |  ${totalItens} conjunto(s), ${pecas.length} linha(s)${comPeso ? `  |  ${totalKg.toLocaleString("pt-BR")} kg` : ""}`,
    ],
    totalColunas: headers.length,
    nomePlanilha: chave === "LPC" ? "LPC" : "LE",
    // Identidade do proprio documento — nao e codigo de procedimento da ISO, e por isso nao
    // imita o formato deles.
    codigoDoc: `${chave}-${op.numero}`,
    revisao,
  });
  ws.columns = comPeso
    ? [{ width: 16 }, { width: 40 }, { width: 16 }, { width: 9 }, { width: 13 }]
    : [{ width: 16 }, { width: 44 }, { width: 18 }, { width: 10 }];

  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, headers); row++;
  for (const p of pecas) {
    adicionarLinhaTabela(ws, row, [
      // ⚠ o recuo vai para a PLANILHA também. Vitor (26/08/2026): "isso acontece no excel também".
      // Sem ele o Excel repete o problema da tela: 197 linhas sem dizer quais são peças de qual
      // conjunto.
      p.nivel ? `    ${p.marca}` : p.marca,
      p.descricao || p.perfil || "—",
      p.material || "—",
      p.qte || 0,
      ...(comPeso ? [Math.round(p.pesoTotalKg || 0)] : []),
    ], { alinhamento: { 3: "center", 4: "right" } });
    row++;
  }
  adicionarLinhaTotais(ws, row, [
    "TOTAL", "", "", totalItens, ...(comPeso ? [totalKg] : []),
  ]);

  const buf = await workbook.xlsx.writeBuffer();
  const bonito = `${chave} OP-${op.numero}${op.obra ? ` ${op.obra}` : ""} ${revisao}`
    .replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 110);
  // ⚠ `filename=` só aceita ASCII com segurança, e o rótulo de revisão de obra com mais de uma
  // frente vem com "·" e acentos. Sem o par ASCII + filename*, parte dos navegadores salva o
  // arquivo com o nome truncado ou trocado — e o cliente fica com "download.xlsx" na pasta.
  const ascii = bonito.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "-");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        `attachment; filename="${ascii}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${bonito}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}

// O cliente diz "já vi essa revisão" e o alerta para de aparecer pra ele.
//
// ⚠ marca só a revisão ATUAL, e por hash: se a lista mudar de novo entre ele abrir a página e
// clicar, o clique não pode apagar um aviso que ele nunca leu.
export async function POST(req, { params }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const chave = String(body.fonte || "").toUpperCase();
  const { erro, op } = await abrirPortal(token, chave);
  if (erro) return erro;

  const ultima = await prisma.portalListaRevisao.findFirst({
    where: { opId: op.id, fonte: chave }, orderBy: { seq: "desc" },
  });
  if (!ultima) return NextResponse.json({ ok: true });
  if (body.seq && Number(body.seq) !== ultima.seq) return NextResponse.json({ ok: false, desatualizado: true });
  if (!ultima.vistoEm)
    await prisma.portalListaRevisao.update({ where: { id: ultima.id }, data: { vistoEm: new Date() } });
  return NextResponse.json({ ok: true });
}
