#!/usr/bin/env node
// Apaga o aceite (só o `aceitoEm`, o convite continua válido) dos Kick Offs que foram marcados
// como confirmados por fora do portal.
//
// Como reconhece: `aceitoEm` exatamente 1.440 minutos depois do `enviadoEm` E sem AuditLog.
// Gente clicando não produz nem uma coisa nem outra — em 24/08/2026 os 212 aceites com log tinham
// 151 intervalos distintos, e os 183 sem log tinham UM: 1440. O padrão é de UPDATE em massa.
//
// O aceite é impresso no PDF do Kick Off como "Confirmado em <data>". Zerado, volta a "Pendente" —
// que é a verdade, e é o que a pessoa vê para então confirmar de fato pelo link do e-mail.
//
//   node --env-file=.env.local scripts/limpar-aceites-kickoff-falsos.mjs            (simula)
//   node --env-file=.env.local scripts/limpar-aceites-kickoff-falsos.mjs --aplicar  (grava)
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

const suspeitos = await p.$queryRaw`
  SELECT a.id, a.email, a.tipo, a."enviadoEm", a."aceitoEm", op.numero
  FROM "KickoffAceite" a
  LEFT JOIN "AuditLog" l ON l.entity = 'KickoffAceite' AND l."entityId" = a.id
  JOIN "OPKickOff" k ON k.id = a."kickoffId"
  JOIN "OP" op ON op.id = k."opId"
  WHERE a."aceitoEm" IS NOT NULL
    AND l.id IS NULL
    AND a."aceitoIp" IS NULL
    AND extract(epoch FROM (a."aceitoEm" - a."enviadoEm")) = 86400
  ORDER BY op.numero, a.email`;

if (!suspeitos.length) {
  console.log("nenhum aceite com a assinatura de marcação em massa — nada a fazer");
} else {
  const porOP = {};
  for (const s of suspeitos) (porOP[s.numero] ||= []).push(s.email);
  console.log(`${suspeitos.length} aceites marcados por fora, em ${Object.keys(porOP).length} OPs:\n`);
  for (const [numero, emails] of Object.entries(porOP)) {
    console.log(`  OP-${numero}  (${emails.length})`);
    console.log(`    ${[...new Set(emails)].join(", ")}`);
  }
  if (APLICAR) {
    const r = await p.kickoffAceite.updateMany({
      where: { id: { in: suspeitos.map((s) => s.id) } },
      data: { aceitoEm: null },
    });
    console.log(`\n✔ ${r.count} aceites voltaram para "Pendente" — o link do e-mail segue valendo`);
  } else {
    console.log("\n(simulação — rode com --aplicar para gravar)");
  }
}
await p.$disconnect();
