import "server-only";
import { createHash } from "node:crypto";
import { prepararDadosCronogramaEnvio } from "./cronograma-envio";
import { gerarEmailCronograma } from "./cronograma-email";
import { gerarCronogramaPDF } from "./cronograma-pdf";
import { gerarCronogramaMSProjectXML } from "./cronograma-msproject-xml";
import { diaBRT } from "./data-br";

export async function prepararPacoteCronograma(c, tarefas, opcoes, user, now = new Date()) {
  const dados = prepararDadosCronogramaEnvio(c, tarefas, opcoes);
  const referencia = diaBRT(now);
  const email = gerarEmailCronograma({ ...dados, opcoes, remetente: user.name, referencia });
  // Detecta edição dos dados/opções depois da conferência, sem gravar uma prévia no banco.
  const hash = createHash("sha256").update(JSON.stringify({
    cronogramaId: c.id, titulo: dados.cronograma.titulo, tipoDias: c.tipoDias,
    opcoes, tarefas: [...dados.tarefas].sort((a,b) => a.id.localeCompare(b.id)),
    resumo: dados.resumo, assunto: email.assunto, html: email.html,
  })).digest("hex");
  const pdf = await gerarCronogramaPDF(dados.cronograma, dados.tarefas, now, {
    refinado: true, comparativo: opcoes.tipoEnvio === "REVISAO", percentual: dados.resumo.percentual,
  });
  const xml = gerarCronogramaMSProjectXML(dados.cronograma, dados.tarefas);
  return {
    ...email, hash,
    anexos: [
      { filename: dados.nomes.pdf, contentType: "application/pdf", content: Buffer.from(pdf.bytes).toString("base64") },
      { filename: dados.nomes.xml, contentType: "application/xml", content: Buffer.from(xml.xml, "utf8").toString("base64") },
    ],
  };
}
