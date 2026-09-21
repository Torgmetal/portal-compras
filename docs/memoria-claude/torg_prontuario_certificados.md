---
name: torg_prontuario_certificados
description: Prontuário Eletrônico (SharePoint) é a fonte única de treinamentos p/ Treinamentos + Conformidade CCT + indicador Atendimento das Competências
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-09T18:30:28.135Z
---

Os certificados de treinamento nos **Prontuários Eletrônicos** do SharePoint viraram a fonte
única de "quem fez qual NR" (Vitor 08/08). Alimenta 3 lugares:

1. **Aba Treinamentos** (`/rh` › Treinamentos): cada linha do plano 2026 é clicável → modal com
   quem concluiu aquela NR + data do certificado. Endpoint `GET /api/rh/treinamentos/certificados`.
2. **Conformidade CCT** (`/rh/documentos` aba Compliance): certificados entram como documentos.
3. **Indicador Atendimento das Competências** (`/qualidade/indicadores` + `/indicadores`, id
   `atendimento_competencias`) e seu detalhe/PDF.

**Lib central `lib/prontuario-certificados.js`** (server-only):
- `escanearCertificados()` varre 2 raízes (RH Torg direto + RH VMI aninhado por grupos), acha
  pastas "Treinamentos" e mapeia arquivo→NR (`nrDoArquivo`: Ficha EPI→NR-06, O.S/Integração→NR-01).
  `data` = registro mais antigo (created/modified). Cache 15min. 512 certificados, ~58 pessoas.
- `documentosDeProntuario(funcs)` casa colaborador↔funcionário (nome normalizado + primeiro/último)
  e devolve por funcionário os documentos-equivalentes da CCT. **Mapa NR→tipo**: NR-12→NR_12,
  NR-35→NR_35, NR-01→INTEGRACAO, NR-06→FICHA_EPI. **Validade = data do certificado + reciclagem
  da NR** (12/24m; INTEGRACAO sem validade). Outros NRs (05/07/09/11/18/20/23/32) NÃO viram
  documento (a Torg não os exige na CCT) — só aparecem no plano.
- `documentosDeProntuarioSeguro(funcs, 25000)` = wrapper com timeout → cai p/ docs do RH sem
  quebrar. **Sempre usar esse nos indicadores** (não o cru).

**Cobertura = "só quem já está no prontuário"** (Vitor): o indicador só mede funcionários com
prontuário (migração em curso); fallback mede todos se o SharePoint cair. Atendimento **66% → 90,7%**
(49/54). Série 2026 = rampa jan 34% → ago 91%, **média anual 66,1%** (meta ≥50%).

**Varredura (cuidado — foi o gargalo):** sequencial dava ~83s/807 chamadas Graph → estourava o
timeout das rotas. Corrigido (commit 6000b71): concorrência limitada (8) + corte de folha (não
desce em A.S.O's/Exames quando já achou "Treinamentos") → ~140 chamadas, ~3-10s. Estrutura é
INCONSISTENTE: alguns aninham `<Colaborador>/VMI/Treinamentos` — por isso o `colab` pula tokens
genéricos (VMI/TORG) via regex `GENERICO`, senão o cert vai pro "VMI" e não casa (ex.: Guilherme
Agnelli). `maxDuration=60` nas rotas rh/indicadores/iso(+pdf) e qualidade/indicadores.

**Fonte = UNIÃO (prontuário + RH Documentos), NÃO só o prontuário** (decidido 09/08 com dado). Vitor
sugeriu usar só as pastas do prontuário; análise mostrou que cortar o RH regride muita gente:
por tipo, OK-só-RH vs OK-só-prontuário vs união → ASO 58/32/58 (26 regridem!), FICHA_EPI 57/53/59,
INTEGRACAO 55/51/55, NR_12 30/**34**/41 (prontuário ADICIONA), NR_35 11/11/12. A união vence sempre.

**Merge = COMPLEMENTA, não duplica** (`mesclarDocs`, Vitor 09/08): o documento do prontuário só
entra se o RH NÃO tiver aquele tipo. Quem já tem ASO real no RH não ganha um segundo — de quebra
evita a data furada da pasta (a A.S.O's tem 81 de 116 arquivos concentrados em 2025 = data de
migração, não do exame). A varredura JÁ lê a pasta A.S.O's / ASO's / A.S.O (todo arquivo → ASO,
validade=data+12m), mas hoje isso só cobre 1 colaborador (o único sem ASO no RH). `NR_PARA_TIPO`
inclui `"ASO":"ASO"`.

**FICHA_EPI agora SEM validade** (`validadeMeses: null`, Vitor 09/08): a ficha de EPI é renovada por
entrega, não vence anual. Conta OK enquanto existir o registro. NR-23 fica em aberto. FORM-11
(`/rh/competencias`, [[torg_matriz_competencias]]) NÃO consome certificados — é cargo×competência;
possível link futuro.

Regras da CCT em `lib/regras-documentos.js` ([[torg_seguranca_pendencias]]); NR-33/NR-10 removidas,
NR-35 só Montagem Externa. Veja [[torg_rh_documentos]], [[torg_indicadores_iso]], [[torg_indicadores]].
