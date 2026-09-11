import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { SO_FABRICACAO } from "./lista-pecas";
import { ehItemComprado } from "./item-comprado";
import { lerProduzidoPorSetor } from "./produzido-setor";
import { pecaEhCroqui, pecaEhComposta, ROTA_SOLO, ROTA_COMPOSTA } from "./prioridades-setor";

/* BAIXA EM LOTE — um clique fecha um setor inteiro de uma OP no portal.
 *
 * ⚠⚠ POR QUE EXISTE. Vitor (09/09/2026): "quando damos uma baixa na mão eu preciso que um
 * funcionário dê baixa de um por um; você viu a quantidade de itens, não é possível não ter uma
 * maneira de darmos baixa de uma vez". A SKA respondeu que o Syneco não tem API de escrita. Então
 * a certeza do "tem ou não tem para fazer" passa a morar aqui — e para isso a baixa precisa caber
 * na mão de quem sabe que a peça está pronta: a 067 na pintura são 162 itens, um clique.
 *
 * ⚠ GRAVA NO MESMO LUGAR DA BAIXA DE UM POR UM (`PecaConjunto.baixaSetores[setor]`), com o mesmo
 * formato — quem já lê a baixa manual (lib/produzido-setor, Despacho, Gantt, filas) passa a ver
 * esta sem mudar nada. O que muda é só `lote: true` e o `motivo`, para a auditoria distinguir.
 *
 * ⚠ A BAIXA VAI NA QUANTIDADE PLANEJADA, não na que falta: `lerProduzidoPorSetor` toma o MAIOR
 * entre Syneco e baixa, então gravar `qte` fecha a peça sem contar duas vezes o que o Syneco já
 * tinha. Gravar só a diferença deixaria a peça meio aberta se o apontamento chegasse depois.
 *
 * ⚠ BAIXAR A PINTURA FECHA A ROTA INTEIRA: a dedução "apontamento na frente dá baixa atrás" lê a
 * baixa do portal como se fosse apontamento. Por isso não há botão "todos os setores" — o último
 * já é isso, e a tela diz.
 *
 * 🚫 NÃO ESCREVE NO SYNECO, e nenhuma tela deve fingir que escreveu: a planilha de Baixa Syneco
 * continua sendo o único caminho para lá, e ela lê o cru de propósito (ver lib/baixa-syneco). */

export const SETORES_BAIXA_LOTE = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];

/* ⚠⚠ CADA PEÇA SÓ PASSA PELOS SETORES DA SUA ROTA — a mesma regra do Despacho (lib/prioridades-setor).
   Sem isto a montagem da OP-102 mostrava 569 peças pendentes quando eram 3: os 200 croquis
   (T102A-P1…) entravam na conta, e croqui não é montado — ele é cortado e some dentro do conjunto.
     · croqui  → só CORTE
     · conjunto composto → da MONTAGEM em diante (o corte dele é o dos croquis)
     · avulsa  → CORTE e o que a rota da avulsa disser (não passa por montagem/solda) */
export function setoresDaPeca(p) {
  if (pecaEhCroqui(p)) return ["CORTE"];
  const rota = pecaEhComposta(p) ? ROTA_COMPOSTA : ROTA_SOLO;
  return rota.filter((s) => SETORES_BAIXA_LOTE.includes(s));
}

/** Peça a peça, o que ainda falta em cada setor de uma OP — depois de TODAS as regras. */
export async function pendenciasDaOp(opId) {
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId, ...SO_FABRICACAO },
    select: { id: true, opId: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, tipoPeca: true, perfil: true, baixaSetores: true,
              _count: { select: { conjuntoCroquis: true } } },
    orderBy: { marca: "asc" },
  });
  const uteis = pecas.filter((p) => !ehItemComprado(p));
  const feito = await lerProduzidoPorSetor(uteis.map((p) => ({ opId: p.opId, marca: p.marca })), SETORES_BAIXA_LOTE);
  const porSetor = {};
  for (const setor of SETORES_BAIXA_LOTE) {
    const itens = [];
    for (const p of uteis) {
      if (!setoresDaPeca(p).includes(setor)) continue;
      const qte = Math.max(1, Number(p.qte) || 1);
      const f = Math.min(qte, feito({ opId: p.opId, marca: p.marca }, setor));
      if (f >= qte) continue;
      itens.push({
        id: p.id, marca: p.marca, descricao: p.descricao || null, tipoPeca: p.tipoPeca || null,
        qte, feito: f, falta: qte - f,
        kgFalta: Math.round(((Number(p.pesoTotalKg) || 0) / qte) * (qte - f) * 100) / 100,
      });
    }
    porSetor[setor] = {
      itens,
      pecas: itens.reduce((t, i) => t + i.falta, 0),
      kg: Math.round(itens.reduce((t, i) => t + i.kgFalta, 0)),
    };
  }
  return { totalPecas: uteis.length, porSetor };
}

/** As peças que a baixa vai fechar num setor — separado para ser testável sem banco. */
export function alvoDoLote(pendencias, setor) {
  const s = pendencias?.porSetor?.[setor];
  if (!s) return [];
  return s.itens.map((i) => ({ id: i.id, qtd: i.qte }));
}

/**
 * Dá baixa em TODAS as pendências de um setor de uma OP, num UPDATE só.
 * @returns {{ atualizados:number, pecas:number, kg:number }}
 */
export async function baixarSetorEmLote({ opId, setor, user, motivo }) {
  if (!SETORES_BAIXA_LOTE.includes(setor)) throw new Error("Setor inválido para baixa em lote.");
  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true } });
  if (!op) throw new Error("OP não encontrada.");
  const pend = await pendenciasDaOp(opId);
  const alvo = alvoDoLote(pend, setor);
  if (!alvo.length) return { atualizados: 0, pecas: 0, kg: 0 };

  const agora = new Date().toISOString();
  const values = Prisma.join(alvo.map((a) => Prisma.sql`(${a.id}::text, ${Math.round(a.qtd)}::numeric)`));
  const atualizados = await prisma.$executeRaw`
    UPDATE "PecaConjunto" p
    SET "baixaSetores" = jsonb_set(
      COALESCE(p."baixaSetores", '{}'::jsonb),
      ${`{${setor}}`}::text[],
      jsonb_build_object('qtd', v.qtd, 'em', ${agora}, 'por', ${user?.id || null}, 'porNome', ${user?.name || null},
                         'lote', true, 'motivo', ${motivo || null}),
      true)
    FROM (VALUES ${values}) AS v(id, qtd)
    WHERE p.id = v.id`;

  const resumo = pend.porSetor[setor];
  // ⚠ auditoria não-fatal: a baixa já está gravada; falhar o log não pode desfazer nem esconder isso
  await prisma.auditLog.create({
    data: {
      userId: user?.id || null, action: "BAIXA_LOTE_SETOR", entity: "OP", entityId: op.id,
      diff: { opNumero: op.numero, setor, pecas: resumo.pecas, kg: resumo.kg, marcas: alvo.length, motivo: motivo || null },
    },
  }).catch(() => {});

  return { atualizados, pecas: resumo.pecas, kg: resumo.kg };
}
