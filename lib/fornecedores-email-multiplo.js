// Tarefa de manutenção: cadastro de fornecedor com VÁRIOS e-mails no campo `email`.
//
// A importação do Omie (25/08/2026) copiou o campo como veio — "a@x.com,b@y.com" — em 10
// cadastros ativos (ARCELORMITTAL entre eles). O envio de cotação valida e-mail no servidor e
// recusava esses fornecedores; a tela mostrava o despejo JSON do Zod (21/09/2026). A importação
// passou a separar (`separarEmails` em lib/fornecedores-envio.js); esta tarefa conserta o que
// já está gravado: o primeiro fica em `email`, os demais vão para `emailsAdicionais` (que já
// existe e vai em cópia nas cobranças de atraso).
//
// ⚠ Só mexe em quem tem MAIS de um e-mail válido no campo. Campo com um e-mail sujo (espaço,
// maiúscula) é normalizado pelo mesmo caminho; campo sem e-mail válido fica como está — apagar
// o lixo esconderia o dado que alguém precisa ver para corrigir.
import { separarEmails } from "@/lib/fornecedores-envio";

const RX_UM_EMAIL_LIMPO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Os cadastros cujo `email` precisa ser separado, com o que vai ficar em cada campo. */
export function planejarSeparacao(fornecedores) {
  const out = [];
  for (const f of fornecedores) {
    const bruto = String(f.email ?? "");
    if (!bruto.trim()) continue;
    const emails = separarEmails(bruto);
    if (!emails.length) continue;
    const jaLimpo = emails.length === 1 && bruto === emails[0] && RX_UM_EMAIL_LIMPO.test(bruto);
    if (jaLimpo) continue;
    const adicionaisAtuais = (f.emailsAdicionais || []).map((e) => String(e).toLowerCase());
    const emailsAdicionais = [...new Set([...adicionaisAtuais, ...emails.slice(1)])].filter((e) => e !== emails[0]);
    out.push({ id: f.id, razaoSocial: f.razaoSocial, de: bruto, email: emails[0], emailsAdicionais });
  }
  return out;
}

const SELECT = { id: true, razaoSocial: true, email: true, emailsAdicionais: true };

export async function checarEmailsMultiplos(prisma) {
  const todos = await prisma.fornecedor.findMany({ where: { email: { not: null } }, select: SELECT });
  const plano = planejarSeparacao(todos);
  const exemplos = plano.slice(0, 3).map((p) => `${p.razaoSocial}: "${p.de}" → ${p.email}${p.emailsAdicionais.length ? ` (+${p.emailsAdicionais.join(", ")})` : ""}`);
  return {
    falta: plano.length,
    detalhe: plano.length
      ? `${plano.length} cadastro(s) com mais de um e-mail no mesmo campo. Ex.: ${exemplos.join(" · ")}`
      : "nenhum cadastro com e-mail acumulado no mesmo campo",
  };
}

export async function aplicarEmailsMultiplos(prisma, user) {
  const todos = await prisma.fornecedor.findMany({ where: { email: { not: null } }, select: SELECT });
  const plano = planejarSeparacao(todos);
  for (const p of plano) {
    await prisma.fornecedor.update({ where: { id: p.id }, data: { email: p.email, emailsAdicionais: p.emailsAdicionais } });
  }
  if (plano.length) {
    await prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        action: "FORNECEDOR_EMAIL_SEPARADO",
        entity: "Fornecedor",
        entityId: "manutencao",
        diff: { fornecedores: plano.map((p) => ({ id: p.id, razaoSocial: p.razaoSocial, de: p.de, email: p.email, emailsAdicionais: p.emailsAdicionais })) },
      },
    });
  }
  return `${plano.length} cadastro(s) corrigido(s): o primeiro e-mail ficou em "e-mail" e os demais em "e-mails adicionais".`;
}
