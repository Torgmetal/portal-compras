// POST /api/producao/pecas/importar-le
// Recebe { rows: [...] } parseado no client (evita limite 4.5MB do Vercel)
// e { opNumero?: string } pra forcar a OP caso o cabecalho nao tenha.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseFormularioLE } from "@/lib/parse-le-form21";
import * as XLSX from "xlsx";
import { log } from "@/lib/log";

const registro = log("api/producao/pecas/importar-le");

export const runtime = "nodejs";
export const maxDuration = 300; // LE grande faz upsert peca a peca; 60s estourava (timeout -> HTML/504)

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "EXPEDICAO", "ENGENHARIA", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { rows, opNumero: opForcada, sobrescrever } = body;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Envie 'rows' como array da planilha parseada" }, { status: 400 });
  }

  // Reconstroi um worksheet a partir das rows e parseia
  let parsed;
  try {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    parsed = parseFormularioLE(buffer, { opNumeroForcado: opForcada || null });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao processar planilha: " + e.message }, { status: 400 });
  }

  const opNumero = String(parsed.opNumero);

  // Resolve opId — busca no banco se parsed.opNumero é string valida.
  // A FORM21 traz o número sem zero à esquerda ("78"), mas a OP é "078": tenta
  // exato e, se falhar, casa pelo número ignorando zero à esquerda/sufixo.
  let op = null;
  try {
    if (parsed.opNumero) {
      op = await prisma.oP.findUnique({ where: { numero: opNumero } });
      if (!op) {
        const m = opNumero.match(/\d+/);
        const alvo = m ? parseInt(m[0], 10) : null;
        if (alvo != null) {
          const cands = await prisma.oP.findMany({ select: { id: true, numero: true } });
          const casa = cands.filter((o) => { const mm = String(o.numero).match(/\d+/); return mm && parseInt(mm[0], 10) === alvo; });
          if (casa.length === 1) op = casa[0]; // só liga quando o match é único
        }
      }
    }
  } catch (e) {
    registro.erro("[importar-le] findUnique OP erro:", e?.message);
  }

  // Diff da revisão (o que mudou vs a LE anterior): snapshot marcas+peso ANTES do
  // upsert (e antes do sobrescrever). incluídas = novas; removidas = sumiram;
  // alteradas = peso mudou.
  const antesLE = await prisma.pecaConjunto.findMany({
    where: { opNumero, fonte: "LE_IMPORT" },
    select: { marca: true, pesoTotalKg: true },
  });
  const pesoAntes = new Map(antesLE.map((p) => [p.marca, Number(p.pesoTotalKg) || 0]));
  const novasPecas = new Map();
  for (const p of parsed.pecas) novasPecas.set(p.marca, Number(p.pesoTotalKg) || 0);
  const diffIncluidas = [], diffAlteradas = [];
  for (const [marca, peso] of novasPecas) {
    if (!pesoAntes.has(marca)) diffIncluidas.push({ marca, peso });
    else if (Math.abs(pesoAntes.get(marca) - peso) > 0.01) diffAlteradas.push({ marca, de: pesoAntes.get(marca), para: peso });
  }
  const diffRemovidas = [...pesoAntes.entries()].filter(([m]) => !novasPecas.has(m)).map(([marca, peso]) => ({ marca, peso }));
  const diff = {
    incluidas: diffIncluidas, removidas: diffRemovidas, alteradas: diffAlteradas,
    nIncluidas: diffIncluidas.length, nRemovidas: diffRemovidas.length, nAlteradas: diffAlteradas.length,
  };

  // Se sobrescrever: a marca sai da LE — mas SÓ SOME se não estiver também na LPC.
  // ⚠ Simétrico ao da importação da LPC. Apagar por `fonte` levava junto a presença da marca na
  // outra lista, porque as duas moram na MESMA linha (@@unique[opNumero, marca]).
  if (sobrescrever) {
    await prisma.pecaConjunto.updateMany({
      where: { opNumero, naLE: true, naLPC: true },
      data: { naLE: false },
    });
    await prisma.pecaConjunto.deleteMany({
      where: { opNumero, naLE: true, naLPC: false },
    });
  }

  // Upsert em lote: 1 findMany (marca -> id) em vez de um findUnique por peca —
  // corta metade dos round-trips ao Neon (era isso que estourava os 60s -> 504).
  // Depois do sobrescrever pra o mapa refletir o estado ja deletado.
  //
  // ⚠⚠ SÓ AS PEÇAS DA PRÓPRIA LE. A busca era por `opNumero` SEM a fonte — e a mesma marca existe
  // nas duas listas de propósito: a LPC lista conjunto + croquis, a LE lista conjunto + acessórios.
  // Onde as duas gravam o MESMO `opNumero` (hoje: 060, 089, 097, 103 e 104 — nas outras a LPC usa o
  // código de frente, "T112A"), o import achava o conjunto da LPC pelo nome e fazia UPDATE nele:
  // a linha da LE nunca nascia e os números da LPC eram sobrescritos pelos da LE. Nessas cinco OPs
  // não há hoje UMA marca em comum entre as duas fontes — que é exatamente o rastro disso.
  const existentes = await prisma.pecaConjunto.findMany({
    // ⚠⚠ SEM FILTRO DE FONTE. Antes buscava só as linhas LE_IMPORT: a marca que a LPC já tinha não
    // era encontrada, o create batia no @@unique, e ela virava "ignorada" — a LE perdia a marca em
    // silêncio. É o espelho do que quebrou a OP-113 do outro lado. Agora a linha existente é
    // atualizada e ganha `naLE`, seja de quem for.
    where: { opNumero },
    select: { id: true, marca: true },
  });
  const idPorMarca = new Map(existentes.map((e) => [e.marca, e.id]));

  let criados = 0, atualizados = 0, ignorados = 0;
  const jaNaOutraLista = []; // marcas que a LPC já tem nesta OP (mesma peça, outra lista)
  for (const p of parsed.pecas) {
    try {
      const existId = idPorMarca.get(p.marca);
      if (existId) {
        // So' atualiza os campos basicos, preserva status/dataConcluida
        await prisma.pecaConjunto.update({
          where: { id: existId },
          data: {
            item: p.item,
            descricao: p.descricao,
            qte: p.qte,
            pesoUnitKg: p.pesoUnitKg,
            pesoTotalKg: p.pesoTotalKg,
            // ⚠ AMARRA A ÓRFÃ. Peça importada quando a OP ainda não existia (ou não casou) ficou com
            // `opId` nulo, e tudo que junta por opId — cobertura, peso da OP, carteira — não a
            // enxerga. O import da LPC já faz esse backfill; o da LE não fazia, e sobrou uma peça
            // órfã na OP-111. Só preenche quando está vazio: nunca reescreve um vínculo existente.
            ...(op?.id ? { opId: op.id } : {}),
            ...(p.observacao ? { observacao: p.observacao } : {}), // só sobrescreve se a lista trouxer
            // ⚠ a linha passa a pertencer à LE. O `fonte` NÃO é rebaixado: se a marca está na LPC,
            // ela continua sendo peça de fabricação para o fluxo de fábrica.
            naLE: true,
          },
        });
        atualizados++;
      } else {
        const novo = await prisma.pecaConjunto.create({
          data: {
            opId: op?.id || null,
            opNumero,
            item: p.item,
            marca: p.marca,
            descricao: p.descricao,
            qte: p.qte,
            pesoUnitKg: p.pesoUnitKg,
            pesoTotalKg: p.pesoTotalKg,
            fluxoEspecial: p.fluxoEspecial,
            observacao: p.observacao || null,
            status: "PENDENTE",
            fonte: "LE_IMPORT",
            naLE: true,
          },
        });
        idPorMarca.set(p.marca, novo.id); // marca repetida na mesma planilha vira update
        criados++;
      }
    } catch (e) {
      // ⚠⚠ MARCA QUE JÁ EXISTE PELA LPC NÃO É ERRO — É A MESMA PEÇA. A chave do banco é
      // `@@unique([opNumero, marca])`, sem a fonte: quando as duas listas usam o mesmo número de OP
      // (o caso da OP-106, cujas 7 marcas da LE já estavam gravadas como LPC), a linha da LE não
      // nasce. Vitor (29/08/2026): "a LPC e a LE são a mesma lista praticamente". O que não pode é
      // isso passar calado — antes contava como "ignorada" sem dizer por quê, e a tela mostrava um
      // import bem-sucedido que não importou nada.
      if (String(e?.code) === "P2002") jaNaOutraLista.push(p.marca);
      ignorados++;
    }
  }

  // Peso REAL da LE da OP = soma das peças LE_IMPORT no banco (deduplicadas por
  // marca), NÃO a soma bruta do arquivo. O FORM 21 lista conjunto + componentes,
  // então parsed.pesoTotal dobra (Vitor 29/07: OP 104 = 13,6 t, não 27,2). A LE é
  // a fonte canônica do peso da OP.
  const aggLE = await prisma.pecaConjunto.aggregate({ where: { opNumero, naLE: true }, _sum: { pesoTotalKg: true } });
  const pesoRealLE = Math.round((aggLE._sum.pesoTotalKg || 0) * 100) / 100;

  // ⚠⚠ SEM REGISTRO NÃO HÁ COMO RESPONDER "EU IMPORTEI". A importação da LPC sempre gravou no
  // AuditLog; a da LE, não — e em 29/08/2026 a Engenharia disse que tinha importado várias listas
  // que continuavam pendentes, e não houve como saber se o import chegou a rodar. Agora deixa
  // rastro igual ao da LPC, inclusive quando a OP não foi encontrada (peça órfã).
  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "IMPORTAR_LE", entity: "PecaConjunto", entityId: op?.id || null,
      diff: {
        opNumero: parsed.opNumero, obra: parsed.obra || null, opEncontrada: !!op,
        totalNoArquivo: parsed.pecas.length, criados, atualizados, ignorados, pesoTotal: pesoRealLE,
        jaNaOutraLista,
      },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    opNumero: parsed.opNumero,
    opEncontrada: !!op,
    obra: parsed.obra || null,
    totalNoArquivo: parsed.pecas.length,
    criados,
    atualizados,
    ignorados,
    jaNaOutraLista,
    avisoListaUnica: jaNaOutraLista.length
      ? `${jaNaOutraLista.length} marca(s) desta LE já existem nesta OP pela LPC — é a mesma peça, não foram duplicadas.`
      : undefined,
    pesoTotal: pesoRealLE, // peso real da LE (deduplicado), não a soma bruta do arquivo
    qteTotal: parsed.qteTotal,
    diff,
  });
}
