// ─── O QUADRO "DADOS ADICIONAIS" DA NF-e DE REMESSA ──────────────────────────
//
// ⚠⚠ O RNTRC SAI POR AQUI PORQUE NÃO EXISTE CAMPO PARA ELE (16/09/2026). Matheus pediu
// (09/09/2026) o RNTRC/ANTT na aba FRETE da remessa. Medido contra a conta real, somente leitura:
//
//   • `ConsultarCliente` da transportadora (TRANSMAGNA, 7318288277) devolve 65 campos e
//     NENHUM casa RNTRC/ANTT — o único espaço livre é `caracteristicas`.
//   • `ConsultarRemessa` da remessa 660 (romaneio RT-6) devolve um bloco `frete` de exatamente
//     13 campos: cEspVol, cMarVol, cNumVol, cPlaca, cTpFrete, cUF, nCodTransp, nPesoBruto,
//     nPesoLiq, nQtdVol, nValFrete, nValOutras, nValSeguro.
//
// O único lugar do payload que chega IMPRESSO na NF-e e aceita texto livre é
// `infAdic.cDadosAdic`, o quadro Dados Adicionais — que é justamente onde o RNTRC aparece em
// emissor sem campo estruturado. Não é gambiarra: é o campo que a NF-e reserva para o que o
// layout não prevê.
//
// ⚠ Ele NÃO entra em `montarFrete`. Mandar `cRNTRC` num bloco que não o tem faz o Omie recusar a
// remessa inteira ("Tag [...] não faz parte da estrutura"), e o erro apareceria só na emissão.

/** RNTRC/ANTT como o Fiscal digitou: só dígitos (o registro da ANTT é numérico, 8 casas). */
export const normalizarRntrc = (frete) => String(frete?.rntrc || "").replace(/\D/g, "").slice(0, 12);

/**
 * O texto do quadro Dados Adicionais: rastreio do romaneio, obra e — quando houver — o RNTRC.
 *
 * ⚠ O RNTRC vai no FIM, depois da obra. As três primeiras partes são o que a produção procura
 * quando abre a nota; o RNTRC é exigência do transporte e quem o lê já sabe onde caçar.
 */
export function dadosAdicionais(romaneio, opts) {
  const rntrc = normalizarRntrc(opts?.frete);
  return [
    opts?.infoAdic ? String(opts.infoAdic).trim() : `Remessa - Romaneio ${romaneio.numero}`,
    romaneio.opRefNumero ? `OP ${romaneio.opRefNumero}` : "",
    romaneio.servico ? `Obra/Servico: ${romaneio.servico}` : "",
    rntrc ? `RNTRC: ${rntrc}` : "",
  ].filter(Boolean).join(" | ").slice(0, 500);
}
