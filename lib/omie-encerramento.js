// ─── PEDIDO DE COMPRA ENCERRADO NO OMIE ──────────────────────────────────────
//
// Matheus (17/09/2026): "precisamos ajustar que o portal reconheça os pedidos ENCERRADOS do Omie
// para não ficar como atrasado, principalmente quando é FATURAMENTO DIRETO".
//
// ⚠⚠ ENCERRADO NÃO É RECEBIDO, E ESTE MÓDULO NUNCA BAIXA NADA. Encerrar é ato administrativo —
// o comprador diz "deste pedido não vem mais nada". Não prova que o material chegou, então aqui
// não se escreve `statusEntrega`, `dataEntregaReal` nem `Recebimento`. A única coisa que muda é a
// cobrança de PRAZO na tela: um pedido encerrado para de aparecer como atrasado.
//
// ⚠⚠ NO FATURAMENTO DIRETO ISSO É ESTRUTURAL, não exceção. O material vai do fornecedor direto à
// obra e nunca entra NF no almoxarifado da Torg — `nQtdeRec` fica 0 para sempre, e por isso o
// pedido nunca "chega" sozinho. Medido em 17/09/2026: dos 48 pedidos FD, 9 sem chegada registrada;
// 4 deles já estavam encerrados no Omie e vermelhos na tela.
//
// ⚠⚠ A ETAPA NÃO SERVE, E ISSO FOI MEDIDO. `cEtapa` vale "15" tanto em pendente quanto em
// encerrado, e `ConsultarPedCompra` não expõe bandeira nenhuma de encerramento (ver
// docs/memoria-claude/torg_omie_recebimento.md). Quem separa é o FILTRO da pesquisa:
// `PesquisarPedCompra{lExibirPedidosEncerrados:"T"}`. Conferido em 17/09 numa amostra de 2026 —
// 200 encerrados contra 95 pendentes, interseção ZERO. As outras grafias que tentei
// (`lExibirEncerrados`, `lExibirPedidosEncerrado`) o Omie rejeita como tag inexistente.
import { omieCall } from "./omie-call.js";
import { log } from "@/lib/log";

const registro = log("omie-encerramento");
const URL_PED = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";

const p2 = (n) => String(n).padStart(2, "0");
const fmtBR = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Teto de páginas da varredura (100 por página). 701 encerrados em 17/09/2026 → 8 páginas. */
export const MAX_PAGINAS = 40;

/**
 * A janela de datas que a pesquisa precisa cobrir para que uma AUSÊNCIA signifique alguma coisa.
 *
 * ⚠⚠ JANELA FIXA MENTIRIA NO DIA SEGUINTE. Se a varredura cobre 2023-2027 e o pedido é de 2022,
 * ele fica fora do conjunto de encerrados por não ter sido procurado — e uma reconciliação que
 * trata ausência como "reabriu" apagaria a marca de um pedido que ninguém tocou. A janela sai dos
 * PEDIDOS LOCAIS: do mais antigo que interessa até bem depois do último.
 */
export function janelaDaColeta(datas) {
  const tempos = (datas || []).map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t));
  const hoje = new Date();
  const de = new Date(tempos.length ? Math.min(...tempos) : hoje.getTime());
  de.setMonth(de.getMonth() - 2); // margem: o Omie filtra pela data do PEDIDO, não pela do portal
  const ate = new Date(hoje);
  ate.setFullYear(ate.getFullYear() + 2);
  return { de, ate };
}

/**
 * Colhe no Omie o conjunto de pedidos de compra ENCERRADOS na janela pedida.
 *
 * ⚠⚠ O RETORNO DIZ SE A COLETA FICOU COMPLETA, e quem chama TEM de olhar. Achado do Codex
 * (17/09/2026): `buscarNFsPorPedidos` engole o erro e devolve um mapa possivelmente parcial —
 * copiar esse contrato aqui seria pior que não ter a funcionalidade, porque uma página que falhou
 * viraria "este pedido reabriu" e a marca sumiria sozinha. Falha, timeout ou teto de páginas
 * atingido ⇒ `completa: false`, e a reconciliação só marca, nunca desmarca.
 *
 * @returns {Promise<{codigos: Set<string>, completa: boolean, paginas: number, motivo: string|null}>}
 */
export async function coletarEncerrados({ de, ate }) {
  const codigos = new Set();
  let paginas = 0;

  for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
    let d;
    try {
      d = await omieCall(URL_PED, "PesquisarPedCompra", {
        nPagina: pg,
        nRegsPorPagina: 100,
        lApenasImportadoApi: "F",
        lExibirPedidosEncerrados: "T",
        dDataInicial: fmtBR(de),
        dDataFinal: fmtBR(ate),
      });
    } catch (e) {
      registro.aviso("[encerramento] página", pg, "falhou:", e?.message);
      return { codigos, completa: false, paginas, motivo: e?.message || "falha na pesquisa" };
    }
    paginas = pg;
    for (const ped of d.pedidos_pesquisa || []) {
      const cod = ped.cabecalho_consulta?.nCodPed;
      if (cod) codigos.add(String(cod));
    }
    const total = Number(d.nTotalPaginas || 1);
    if (pg >= total) return { codigos, completa: true, paginas, motivo: null };
  }
  return { codigos, completa: false, paginas, motivo: `teto de ${MAX_PAGINAS} páginas atingido` };
}

/**
 * Decide, para cada pedido local, o que gravar — a regra pura, sem banco nem rede.
 *
 * ⚠ Marcar é sempre seguro; DESMARCAR só com coleta completa. É a assimetria que o Codex pediu:
 * a marca some apenas quando o portal tem certeza de ter procurado o pedido e não o achado.
 *
 * @param {{id:string, codigoPedido:string|null, encerradoOmieEm:Date|null}[]} pedidos
 * @param {{codigos:Set<string>, completa:boolean}} coleta
 * @param {Date} agora quando o portal DETECTOU (o Omie não devolve a data do encerramento)
 */
export function decidirEncerramentos(pedidos, coleta, agora = new Date()) {
  const marcar = [], desmarcar = [];
  for (const p of pedidos || []) {
    if (!p.codigoPedido) continue;
    const encerradoNoOmie = coleta.codigos.has(String(p.codigoPedido));
    if (encerradoNoOmie && !p.encerradoOmieEm) marcar.push(p.id);
    else if (!encerradoNoOmie && p.encerradoOmieEm && coleta.completa) desmarcar.push(p.id);
  }
  return { marcar, desmarcar, em: agora };
}

/**
 * Reconcilia a marca de encerramento de todos os pedidos do portal contra o Omie.
 *
 * ⚠ Varre TODOS os pedidos com código, sem o corte de 12 meses do `syncEntregas` — a tela de
 * Prazos não tem esse corte, e pedido antigo encerrado é justamente o que fica encalhado em
 * vermelho. São 284 linhas de um `select` de três campos; o custo está na rede do Omie, e essa é
 * a mesma varredura de ~8 páginas para qualquer tamanho de lista.
 */
export async function reconciliarEncerramentos(prisma) {
  const pedidos = await prisma.pedidoOmie.findMany({
    where: { codigoPedido: { not: null }, status: { notIn: ["REVERTIDO", "ERRO"] } },
    select: { id: true, codigoPedido: true, encerradoOmieEm: true, createdAt: true },
  });
  if (pedidos.length === 0) return { total: 0, marcados: 0, desmarcados: 0, completa: true, motivo: null };

  const janela = janelaDaColeta(pedidos.map((p) => p.createdAt));
  const coleta = await coletarEncerrados(janela);
  const { marcar, desmarcar, em } = decidirEncerramentos(pedidos, coleta);

  if (marcar.length) {
    await prisma.pedidoOmie.updateMany({ where: { id: { in: marcar } }, data: { encerradoOmieEm: em } });
  }
  if (desmarcar.length) {
    await prisma.pedidoOmie.updateMany({ where: { id: { in: desmarcar } }, data: { encerradoOmieEm: null } });
  }
  return {
    total: pedidos.length,
    marcados: marcar.length,
    desmarcados: desmarcar.length,
    encerradosNoOmie: coleta.codigos.size,
    completa: coleta.completa,
    motivo: coleta.motivo,
  };
}
