// AJUSTES DE BANCO PENDENTES — aplicados por quem é dono do portal, com um clique.
//
// ⚠⚠ POR QUE ISTO EXISTE. Uma correção às vezes precisa de uma coluna nova ou de um acerto de dado
// que o código sozinho não faz. Até aqui isso virava "rode este SQL no console do Neon", e a
// correção ficava parada esperando — enquanto a fábrica seguia com a tela errada. Vitor
// (04/09/2026): "como vamos corrigir isso de uma vez".
//
// Cada tarefa aqui é ADITIVA e IDEMPOTENTE: rodar duas vezes não faz mal, e nenhuma apaga dado.
// Nada de DROP, nada de DELETE — se um dia for preciso, não é por aqui.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminDoPortal } from "@/lib/session";
import { conferirBanco } from "@/lib/banco-esperado";
import { conferirEtapaPortalXSyneco } from "@/lib/conferencias";
import { perfisSemMaterialDaOp } from "@/lib/rastreio-sem-material";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * As tarefas, na ordem em que devem rodar.
 *
 * `checar` diz se ainda falta fazer (e quanto), `aplicar` faz. Uma tarefa que já está aplicada
 * aparece na tela como "em dia" e o botão nem a executa.
 */
const TAREFAS = [
  {
    // ⚠⚠ ESTA NÃO É ESCRITA À MÃO — ela VARRE. Vitor (04/09/2026): "terá alguma coisa que vai
    // varrer sozinho?". As duas tarefas de coluna abaixo existiram porque eu lembrei de escrevê-las;
    // esquecer uma é derrubar a tela em produção com "column does not exist". Esta compara o modelo
    // do Prisma (o mesmo que gera as consultas) com o banco e cobra o que faltar — inclusive o que
    // eu criar amanhã. Ver lib/banco-esperado.js.
    id: "colunas-faltando",
    titulo: "Colunas que o código espera e o banco não tem",
    porque: "Varredura automática do modelo contra o banco. Coluna que o código usa e o banco não tem derruba a tela com \"column does not exist\" — e é o que mais trava correção nova.",
    async checar() {
      const { criaveis, revisar } = await conferirBanco(prisma);
      const partes = [];
      if (criaveis.length) partes.push(`${criaveis.length} coluna(s) a criar: ${criaveis.slice(0, 6).map((c) => `${c.tabela}.${c.coluna}`).join(", ")}${criaveis.length > 6 ? "…" : ""}`);
      if (revisar.length) partes.push(`${revisar.length} para conferir à mão: ${revisar.slice(0, 4).map((r) => `${r.tabela}${r.coluna ? "." + r.coluna : ""} (${r.motivo})`).join("; ")}${revisar.length > 4 ? "…" : ""}`);
      return { falta: criaveis.length > 0, detalhe: partes.join(" · ") || "banco em dia com o modelo" };
    },
    async aplicar() {
      const { criaveis, revisar } = await conferirBanco(prisma);
      for (const c of criaveis) await prisma.$executeRawUnsafe(c.sql);
      const extra = revisar.length ? ` · ${revisar.length} continua(m) para conferir à mão` : "";
      return `${criaveis.length} coluna(s) criada(s)${extra}`;
    },
  },
  {
    id: "montagem-pendente",
    titulo: "Conjuntos programados que ficaram invisíveis na montagem",
    porque:
      "Até 04/09/2026 a liberação só virava o status de quem estava em CORTE; conjunto que nunca teve apontamento de corte ficava PENDENTE, com dia e bancada marcados, fora de todos os painéis. O erro já está corrigido — isto regulariza quem ficou para trás.",
    async checar() {
      const n = await prisma.pecaConjunto.count({ where: ALVO_MONTAGEM });
      return { falta: n > 0, detalhe: n ? `${n} conjunto(s) para regularizar` : "nenhum pendente" };
    },
    async aplicar() {
      // ⚠ Seguro por construção: `montagemDiaProgramado` só é gravado para as peças que PASSARAM na
      // prontidão (todos os croquis cortados) no momento da liberação — ter dia é a prova de que o
      // portão foi cumprido. Ver app/api/producao/pecas/liberar-montagem/route.js.
      const r = await prisma.pecaConjunto.updateMany({
        where: ALVO_MONTAGEM,
        data: { status: "MONTAGEM", ultimoSetor: "Montagem" },
      });
      return `${r.count} conjunto(s) regularizado(s)`;
    },
  },
  {
    // ⚠ o cron novo (5h50 e 13h50) faz isso sozinho daqui pra frente; esta tarefa existe para o
    // acúmulo — e para quem não quer esperar o próximo horário.
    id: "casar-certificados",
    titulo: "Certificados com PDF na pasta e sem vínculo",
    porque:
      "Vitor (05/09/2026): \"por que não está dando para baixar os certificados? o Eduardo disse que anexou na pasta\". Estava anexado; faltava casar o PDF com o R. Sem o vínculo, o cliente vê a linha da rastreabilidade sem download e o data book monta sem o certificado.",
    async checar() {
      const { mapearCertificados } = await import("@/lib/match-certificados");
      const { DO_CMR } = await import("@/lib/cmr-origens");
      const mapa = await mapearCertificados();
      const docs = await prisma.documentoQualidade.findMany({
        where: { ativo: true, ...DO_CMR, importRef: { not: null }, sharepointItemId: null },
        select: { importRef: true },
      });
      const n = docs.filter((d) => mapa.porIndice.has(d.importRef)).length;
      return { falta: n > 0, detalhe: n ? `${n} certificado(s) esperando o vínculo (${mapa.totalPdfs} PDFs na pasta)` : "todos os PDFs da pasta já estão vinculados" };
    },
    async aplicar() {
      const { casarCertificados } = await import("@/lib/match-certificados");
      const r = await casarCertificados();
      return `${r.casados} certificado(s) vinculado(s)`;
    },
  },
  {
    id: "baixa-preparacao-113",
    titulo: "Baixa da preparação da OP-113",
    porque:
      "Vitor (04/09/2026): a preparação da 113 está concluída e a obra já está em acabamento e pintura. A fábrica não aponta Preparação no Syneco (115 ordens, zero produzido), então o portal nunca ficaria sabendo sozinho: as peças seguem na fila do corte e os lotes de corte seguem abertos.",
    async checar() {
      const op = await opDaObra("113");
      if (!op) return { falta: false, detalhe: "OP-113 não encontrada" };
      const [pecas, libs] = await Promise.all([
        prisma.pecaConjunto.count({ where: alvoPreparacao(op.id) }),
        prisma.liberacaoProducao.count({ where: alvoLotesCorte(op.id) }),
      ]);
      return {
        falta: pecas > 0 || libs > 0,
        detalhe: pecas || libs ? `${pecas} peça(s) sem baixa · ${libs} lote(s) de corte aberto(s)` : "já dada",
      };
    },
    async aplicar() {
      const op = await opDaObra("113");
      if (!op) throw new Error("OP-113 não encontrada");
      const agora = new Date();
      // ⚠ SÓ A PREPARAÇÃO. Conjunto (montagem), solda, acabamento e pintura NÃO são tocados aqui:
      // dizer que a preparação acabou é o que ele afirmou; declarar os outros setores concluídos
      // seria inventar produção que ninguém apontou.
      const r = await prisma.pecaConjunto.updateMany({
        where: alvoPreparacao(op.id),
        data: { corteConcluidoEm: agora, status: "CORTE", ultimoSetor: "Corte" },
      });
      // quem nunca teve início ganha início = conclusão (mesma regra da fila de corte)
      await prisma.pecaConjunto.updateMany({
        where: { opId: op.id, corteConcluidoEm: { not: null }, corteIniciadoEm: null },
        data: { corteIniciadoEm: agora },
      });
      const l = await prisma.liberacaoProducao.updateMany({
        where: alvoLotesCorte(op.id),
        data: { status: "CONCLUIDA", concluidaEm: agora },
      });
      return `${r.count} peça(s) com baixa e ${l.count} lote(s) de corte fechado(s)`;
    },
  },
  {
    // ⚠⚠ ISTO GRAVA UMA DECLARAÇÃO DE RASTREABILIDADE, e por isso o botão está aqui e não num
    // script meu: quem clica assina. O registro guarda quem declarou e quando, e o motivo diz em
    // letras que a escolha do fardo foi automática — para o Almoxarifado poder conferir e trocar.
    //
    // Vitor (05/09/2026), fechando o data book da OP-085: "possa ser que eu comprei material em
    // nome de outro cliente e o recebimento não fica sabendo, ou seja precisa pegar dentro da
    // planilha um R para casar para todos esses itens". São 39 perfis para 11 materiais.
    id: "origem-r-085",
    titulo: "OP-085 — amarrar a origem do aço lançado em outra obra",
    porque:
      "39 perfis da 085 não têm entrada no CMR da própria obra porque o material foi comprado em nome de outro cliente. Enquanto ninguém declara de onde veio, a peça sai sem R no data book. A escolha do fardo é automática (chegou antes do corte, com certificado, preferindo lote sem obra) e fica registrada como automática — confira com o Almoxarifado e troque na tela Qualidade › Perfis sem material se algum estiver errado.",
    async checar() {
      const r = await perfisSemMaterialDaOp("085");
      if (!r) return { falta: false, detalhe: "OP-085 não encontrada" };
      const grupos = agruparPorMaterial(r.perfis);
      const perfis = grupos.reduce((n, g) => n + g.perfis.length, 0);
      const semCandidato = r.perfis.filter((g) => !g.jaApontado && !g.candidatos.length).length;
      const extra = semCandidato ? ` · ${semCandidato} perfil(s) sem candidato em obra nenhuma (não dá para amarrar)` : "";
      return {
        falta: grupos.length > 0,
        detalhe: grupos.length
          ? `${perfis} perfil(s) em ${grupos.length} material(is): ${grupos.slice(0, 4).map((g) => `${g.material.slice(0, 34)} → R ${g.r}`).join(" · ")}${grupos.length > 4 ? "…" : ""}${extra}`
          : `nada a amarrar${extra}`,
      };
    },
    async aplicar(user) {
      const r = await perfisSemMaterialDaOp("085");
      const grupos = agruparPorMaterial(r?.perfis || []);
      const op = await prisma.oP.findFirst({ where: { numero: "085" }, select: { id: true } });
      let n = 0;
      for (const g of grupos) {
        for (const p of g.perfis) {
          const motivo = `origem escolhida automaticamente na Manutenção (lote disponível antes do corte, com certificado, preferindo lote sem obra) — R ${g.r}${g.op ? ` da OP-${g.op}` : " sem obra"}; conferir com o Almoxarifado`;
          await prisma.trocaRastreabilidade.upsert({
            where: { opNumero_perfil: { opNumero: "085", perfil: p.perfil } },
            create: { opId: op?.id || null, opNumero: "085", perfil: p.perfil, rUsado: g.r, escopo: p.escopo, motivo, trocadoPorId: user?.id || null, trocadoPorNome: user?.name || null },
            update: { rUsado: g.r, escopo: p.escopo, motivo, trocadoPorId: user?.id || null, trocadoPorNome: user?.name || null },
          });
          n++;
        }
      }
      return `${n} perfil(s) amarrado(s) em ${grupos.length} material(is). Agora abra o data book da 085 e clique em "Trazer certificados de material (aço) desta OP" na §04 — é o clique que traz os certificados desses R para dentro do livro.`;
    },
  },
];

const opDaObra = (numero) => prisma.oP.findFirst({ where: { numero }, select: { id: true } });

/** Croqui e avulsa da obra que ainda não têm o corte concluído — conjunto entra pela montagem. */
const alvoPreparacao = (opId) => ({
  opId,
  NOT: { tipoPeca: "CONJUNTO" },
  corteConcluidoEm: null,
});

/** Lotes de corte ainda abertos da obra. */
const alvoLotesCorte = (opId) => ({
  opId,
  status: { in: ["LIBERADA", "EM_PRODUCAO"] },
  setores: { array_contains: ["CORTE"] },
});

// ── ESCOLHA DO FARDO ─────────────────────────────────────────────────────────────────────────
//
// A regra, na ordem, é a mesma que a tela de Perfil sem material já usa para ordenar os candidatos:
//   1. o lote tem de ter chegado ANTES do corte — peça não sai de aço que ainda não estava aqui;
//   2. com certificado digitalizado — R sem PDF não fecha data book, só troca um buraco por outro;
//   3. lote SEM obra na coluna do CMR antes de lote de outra obra — estoque puro é o candidato
//      menos comprometido;
//   4. entre os que sobram, o mais recente: é o que estava na prateleira quando se cortou.
// ⚠ `teto` = o corte mais recente da OP. Perfil que nunca foi apontado no corte não tem data
// própria, e sem teto o critério "mais recente" escolhia um fardo que chegou depois da obra inteira
// (na 085 ia pegar uma chapa de 3,00 recebida em 02/09/2026 para uma peça de 2025).
function melhorCandidato(cands, teto) {
  const plausiveis = cands.filter((c) => c.antesDoCorte !== false && !(teto && c.recebidoEm && new Date(c.recebidoEm) > teto));
  const pool = plausiveis.length ? plausiveis : cands.filter((c) => c.antesDoCorte !== false);
  if (!pool.length) return null;
  return [...pool].sort((a, b) =>
    (b.temArquivo === true) - (a.temArquivo === true) ||
    (!b.op) - (!a.op) ||
    new Date(b.recebidoEm || 0) - new Date(a.recebidoEm || 0)
  )[0] || null;
}

// Um R por MATERIAL, não por perfil: a mesma chapa de 6,35 aparece na lista como CH6.40X102,
// CH6.40X73, CH6.40X64… e o fardo é o mesmo. Devolve [{ material, r, perfis:[{perfil, escopo}] }].
function agruparPorMaterial(perfis) {
  const datas = perfis.map((g) => (g.cortadoEm ? new Date(g.cortadoEm) : null)).filter(Boolean);
  const teto = datas.length ? new Date(Math.max(...datas)) : null;
  const porMaterial = new Map();
  for (const g of perfis) {
    if (g.jaApontado || !g.candidatos.length) continue;
    const c = melhorCandidato(g.candidatos, teto);
    if (!c) continue;
    const chave = c.material || `R${c.r}`;
    const grupo = porMaterial.get(chave) || { material: chave, r: c.r, op: c.op, recebidoEm: c.recebidoEm, temArquivo: c.temArquivo, perfis: [] };
    // ⚠ TODAS quando o perfil não tem material nenhum na OP; SEM_R quando ele TEM (a peça é a que
    // foi cortada antes da entrega) — senão a declaração atropelaria rastreio bom das irmãs.
    grupo.perfis.push({ perfil: g.perfil, marcas: g.marcas, escopo: g.motivo === "SEM_MATERIAL" ? "TODAS" : "SEM_R" });
    porMaterial.set(chave, grupo);
  }
  return [...porMaterial.values()].sort((a, b) => b.perfis.length - a.perfis.length);
}

const ALVO_MONTAGEM = {
  tipoPeca: "CONJUNTO",
  status: "PENDENTE",
  montagemDiaProgramado: { not: null },
};

export async function GET(req) {
  try { await requireAdminDoPortal(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  // ⚠ as CONFERÊNCIAS vêm num pedido à parte: elas varrem obra por obra contra o Syneco e levam
  // ~13 s. Junto das tarefas, a tela inteira ficaria esperando por elas — e o que a pessoa veio
  // fazer (aplicar um ajuste) é o que aparece primeiro.
  if (new URL(req.url).searchParams.get("so") === "conferencias") {
    const conferencias = [];
    try {
      const etapa = await conferirEtapaPortalXSyneco();
      conferencias.push({
        id: "etapa-portal-syneco",
        titulo: "Etapa da peça: portal × fábrica",
        porque: "Compara o que o portal mostra com o que o Syneco apontou. Foi assim que a OP-112 apareceu parada para o cliente enquanto a fábrica cortava as peças dela.",
        ok: etapa.length === 0,
        achados: etapa.map((x) => x.texto),
        detalhe: etapa.length === 0
          ? "nenhuma obra com produção apontada e etapa vazia no portal"
          : `${etapa.length} obra(s) para olhar`,
      });
    } catch (e) {
      conferencias.push({
        id: "etapa-portal-syneco", titulo: "Etapa da peça: portal × fábrica",
        ok: null, achados: [], detalhe: `não consegui conferir: ${e?.message || "erro"}`,
      });
    }
    return NextResponse.json({ conferencias, alertas: conferencias.filter((c) => c.ok === false).length });
  }

  const tarefas = [];
  for (const t of TAREFAS) {
    try {
      const { falta, detalhe } = await t.checar();
      tarefas.push({ id: t.id, titulo: t.titulo, porque: t.porque, falta, detalhe });
    } catch (e) {
      tarefas.push({ id: t.id, titulo: t.titulo, porque: t.porque, falta: null, detalhe: `não consegui conferir: ${e?.message || "erro"}` });
    }
  }
  return NextResponse.json({ tarefas, pendentes: tarefas.filter((t) => t.falta).length });
}

export async function POST(req) {
  let user;
  try { user = await requireAdminDoPortal(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const so = Array.isArray(body?.ids) && body.ids.length ? new Set(body.ids) : null;

  const feitos = [];
  for (const t of TAREFAS) {
    if (so && !so.has(t.id)) continue;
    try {
      const { falta } = await t.checar();
      if (!falta) { feitos.push({ id: t.id, titulo: t.titulo, ok: true, resultado: "já estava em dia" }); continue; }
      const resultado = await t.aplicar(user);
      feitos.push({ id: t.id, titulo: t.titulo, ok: true, resultado });
    } catch (e) {
      // ⚠ uma tarefa que falha não impede as outras: são independentes, e parar tudo por causa de
      // uma deixaria o banco a meio caminho sem ninguém saber qual metade passou.
      feitos.push({ id: t.id, titulo: t.titulo, ok: false, resultado: e?.message || "falhou" });
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "MANUTENCAO_BANCO", entity: "Sistema",
        entityId: feitos.map((f) => f.id).join(","),
        diff: { feitos },
      },
    });
  } catch { /* auditoria não pode derrubar a manutenção */ }

  return NextResponse.json({ ok: feitos.every((f) => f.ok), feitos });
}
