// O QUE O CLIENTE CONSULTA NA OBRA DELE — relatório de inspeção já fechado.
//
// Vitor (22/09/2026), sobre o Renato Massano (inspetor de qualidade da TMSA, contato da OP-105 e
// login de cliente): *"vamos manter assim, apenas deixe disponível para ele consultar quando o Davi
// assinar"*.
//
// A regra do espaço do cliente continua a de 28/08: aparece o que foi ENVIADO para a pessoa —
// assinar, data book, portal da obra. O Renato via a OP-105 e uma lista vazia porque o único
// relatório da obra (RPM-105-002) foi para assinatura do Davi, não dele.
//
// ⚠⚠ O QUE ENTRA É LEITURA DO QUE JÁ ESTÁ FECHADO, nunca do que está em andamento. Documento em
// circulação ainda pode mudar (e volta para revisão); mostrá-lo ao cliente faria o inspetor dele
// conferir uma versão que a Torg ainda não assinou.
//
// ⚠ E só para quem tem a obra LIBERADA — contato da OP ou e-mail do cadastro (ver
// lib/cliente-obras.js, que é onde a Torg libera e revoga). Quem chegou à obra por ter assinado UM
// documento continua vendo só o que é dele: entrar numa assinatura não é ganhar a obra inteira.

const norm = (e) => String(e || "").trim().toLowerCase();

/** A obra está liberada para este login? (contato da OP ou e-mail do cadastro do cliente) */
export function obraLiberadaPara(op, email) {
  const e = norm(email);
  if (!e) return false;
  if (norm(op?.clienteEmail) === e) return true;
  return (Array.isArray(op?.clienteContatos) ? op.clienteContatos : []).some((c) => norm(c?.email) === e);
}

/**
 * O ciclo de assinatura fechou?
 *
 * ⚠⚠ NÃO DÁ PARA CONFIAR SÓ NO `status`. Quem assina grava "CONCLUIDO" num update com
 * `.catch(() => {})` (app/api/assinar/[token]/route.js): se aquela gravação falhar, o documento
 * está assinado por todos e o campo diz EM_ANDAMENTO para sempre. As assinaturas são o fato.
 *
 * ⚠ REVISAO_PEDIDA manda mais que as assinaturas colhidas: o documento foi devolvido, sobe de
 * revisão e o ciclo recomeça — não é leitura, é rascunho.
 */
export function cicloConcluido(envio) {
  if (!envio || envio.status === "REVISAO_PEDIDA") return false;
  if (envio.status === "CONCLUIDO") return true;
  const ass = Array.isArray(envio.assinaturas) ? envio.assinaturas : [];
  return ass.length > 0 && ass.every((a) => !!a?.assinadoEm);
}

/** A data em que o documento fechou: a ÚLTIMA assinatura colhida. */
const fechadoEm = (envio) => {
  const datas = (Array.isArray(envio?.assinaturas) ? envio.assinaturas : [])
    .map((a) => a?.assinadoEm).filter(Boolean).map((d) => new Date(d));
  return datas.length ? new Date(Math.max(...datas)) : null;
};

/**
 * O documento de CONSULTA de um relatório, ou `null` enquanto ele não está fechado.
 *
 * ⚠ `assinadoEm: null` de propósito — esse campo é "quando EU assinei", e quem consulta não
 * assinou nada. A data de fechamento vai em `concluidoEm`, e é ela que a tela escreve.
 * ⚠ `link: null` porque não há o que assinar: o cartão sai sem o botão.
 */
export function documentoDeConsulta(rel) {
  const envio = rel?.envioAssinatura;
  if (!cicloConcluido(envio)) return null;
  return {
    titulo: envio.titulo || rel.codigo,
    tipo: "RELATORIO_INSPECAO",
    papel: null,
    revisao: rel.revisao ?? null,
    enviadoEm: envio.enviadoEm || null,
    assinadoEm: null,
    concluidoEm: fechadoEm(envio),
    somenteLeitura: true,
    aguardandoVez: false,
    revisaoPedida: false,
    link: null,
    pdf: `/api/cliente/relatorio/${rel.id}/pdf`,
  };
}

/**
 * Os relatórios que este login pode CONSULTAR nas obras dele — já prontos como documento da lista.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ops: Array, email: string, ignorarEnvios?: Set<string>}} ctx `ignorarEnvios` são os
 *   envios em que ele mesmo assina: esses já entram na lista com o link de assinar.
 * @returns {Promise<Array<{opNumero: string, doc: object}>>}
 */
export async function relatoriosParaConsulta(prisma, { ops, email, ignorarEnvios = new Set() }) {
  const liberadas = (ops || []).filter((o) => obraLiberadaPara(o, email));
  if (!liberadas.length) return [];
  // ⚠ o relatório guarda o número como a obra o escreve ("67" e "067" convivem) — as variantes
  // evitam que a lista fique vazia por causa de um zero à esquerda.
  const variantes = new Set();
  const doLogin = new Set();
  for (const o of liberadas) {
    const n0 = String(o.numero).trim(), sem = n0.replace(/^0+/, "");
    for (const v of [n0, sem, sem.padStart(2, "0"), sem.padStart(3, "0")]) if (v) { variantes.add(v); doLogin.add(v); }
  }
  const rels = await prisma.relatorioInspecao.findMany({
    where: { opNumero: { in: [...variantes] }, envioAssinaturaId: { not: null } },
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, tipo: true, revisao: true, opNumero: true,
      envioAssinatura: { select: { id: true, status: true, titulo: true, enviadoEm: true, assinaturas: { select: { assinadoEm: true } } } },
    },
    take: 400,
  }).catch(() => []);
  const out = [];
  for (const r of rels) {
    if (!doLogin.has(String(r.opNumero || "").trim()) || ignorarEnvios.has(r.envioAssinatura?.id)) continue;
    const doc = documentoDeConsulta(r);
    if (doc) out.push({ opNumero: r.opNumero, doc });
  }
  return out;
}
