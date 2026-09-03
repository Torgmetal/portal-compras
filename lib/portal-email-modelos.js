// ─── OS MODELOS DE E-MAIL DO PORTAL ───────────────────────────────────────────
//
// Vitor (03/09/2026), sobre o anúncio da OP-118: "será apenas para esse envio ok, para os próximos
// volta ao normal".
//
// ⚠⚠ POR ISSO É MODELO, E NÃO TEXTO SALVO NO PORTAL. Se o texto do anúncio fosse gravado na obra,
// ele voltaria em todo reenvio e no primeiro convite da obra seguinte — e um anúncio de novidade
// repetido vira ruído. Aqui ele é uma ESCOLHA do momento do envio: o padrão continua sendo o
// convite de sempre, e quem quiser anunciar algo escolhe o modelo na hora.
const P = (t) => `<p style="margin:0 0 14px;line-height:1.6">${t}</p>`;
const ITEM = (titulo, texto) =>
  `<tr><td style="padding:0 0 12px">
     <div style="font-weight:bold;color:#0D1F3C;font-size:14px">${titulo}</div>
     <div style="color:#3f5060;font-size:14px;line-height:1.55">${texto}</div>
   </td></tr>`;

export const MODELOS_EMAIL = [
  {
    id: "PADRAO",
    nome: "Convite padrão",
    resumo: "Apresenta o portal a quem está recebendo o link pela primeira vez.",
    faixa: "Portal da Obra",
    corpo: ({ obra }) => P(
      `Preparamos um portal para você acompanhar a fabricação de <strong>${obra}</strong>: cronograma, ` +
      `relatórios de inspeção aprovados, certificados de matéria-prima com rastreabilidade e os ` +
      `documentos da obra — atualizados conforme ela avança.`
    ),
  },
  {
    // ⚠ escrito para quem JÁ usa o portal: não reapresenta o que ele é, diz o que ganhou. Foi
    // aprovado pelo Vitor em 03/09/2026 para o envio da OP-118.
    id: "NOVIDADES_3D",
    nome: "Anúncio — portal mais completo (3D, rastreabilidade, níveis)",
    resumo: "Para quem já acessa o portal e vai receber as novidades do modelo 3D.",
    faixa: "Portal da Obra — agora mais completo",
    corpo: () => `
      ${P(`Como vocês sabem, criamos o portal para reunir num só lugar tudo o que diz respeito à obra —
        documentos, cronograma, qualidade e expedição — em vez de anexos soltos e informação espalhada
        por e-mails. Agora entregamos a vocês um portal ainda mais completo.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0 6px">
        ${ITEM("A obra em 3D, dentro do portal",
          "Dá para girar o modelo, aproximar e clicar em qualquer peça. O clique abre a ficha dela: marca, tipo, material, quantidade e peso.")}
        ${ITEM("O andamento de cada peça",
          "A ficha mostra em que etapa a peça está na fábrica e, quando já embarcou, o romaneio e a data.")}
        ${ITEM("Rastreabilidade e qualidade no mesmo lugar",
          "A corrida do material, o certificado e a norma, além dos relatórios de inspeção emitidos que cobrem aquela peça.")}
        ${ITEM("Listas por nível, para apoiar o campo",
          "Os níveis do projeto viraram filtro: escolhendo um nível, o modelo isola só as peças dele e a lista sai em planilha. Serve para preparar a montagem de um nível, conferir uma peça ou achar um detalhe sem abrir cinco arquivos.")}
      </table>
      ${P(`Trabalhamos dia e noite para entregar o melhor que conseguimos a quem confia a obra à Torg —
        e isto não para por aqui: a cada novo contrato queremos ter algo novo para mostrar.`)}
      ${P(`Qualquer dúvida, ou qualquer ideia de melhoria que vocês gostariam de ver ali dentro, nosso
        time está à disposição.`)}`,
  },
];

export const MODELO_EMAIL = Object.fromEntries(MODELOS_EMAIL.map((m) => [m.id, m]));

/** O modelo escolhido, com o padrão como rede de segurança. */
export function modeloDeEmail(id) {
  return MODELO_EMAIL[id] || MODELO_EMAIL.PADRAO;
}
