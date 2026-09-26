# Inteligência Fiscal enxuta (26/09/2026)

Matheus: "a aba Inteligência está muito complexa". Ficaram 4 abas (Simulador, Auditoria de medição,
Consulta NCM/CFOP, Assistente) + Administração só ADMIN. Spec e plano em `docs/superpowers/`.

- **Imposto estimado da obra = `OPReceita`** (CFOP + % ICMS/IPI/PIS/COFINS/ISS/IRRF/CSLL), 41 de 50
  OPs. ⚠ `PropostaEstudo` tem alíquotas mas 0 OPs ligadas; `OP.estudoDados` só 1. Não procurar lá.
- **IBS/CBS vem do `ListarNF`**: por item `pAliqCbs`, `pAliqIBSUf`, `vBCIbsCbs` + NCM/CFOP pontuados.
  ⚠ NÃO traz UF do destinatário, CST/cClassTrib nem alíquota municipal → chave NCM×CFOP. ⚠ Em 2027 o
  IBS varia pelo destino: vai precisar da UF (cliente por `nCodCli`).
- `FiscalRegraIbsCbs` (lib/fiscal/coleta-ibs-cbs.js): a gravação SOMA notas — cron só "ontem"; o botão
  reconstrói o ano com DELETE na transação. Carga inicial: 484 NF de 2026 → 84 regras, 0 divergência.
- ⚠ `ipiDaTipi` devolve `{valor,tipo}` (NT sem valor), não `{aliquota}` — use `ipiDaRegra`.
- ⚠ Quantidade decimal em campo pt-BR: preencher com vírgula; `numero()` tira o ponto de milhar.
- Achado de dado: OP-085 tem PIS 7,6 % e COFINS 1,65 % cadastrados (parecem invertidos).
