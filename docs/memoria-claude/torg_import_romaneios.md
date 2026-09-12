---
name: torg_import_romaneios
description: "Importar romaneios da pasta da OP (FORM 22 no SharePoint) para o portal — só obras antigas; armadilhas de item comprado, gêmea LPC/LE e peso"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T03:29:58.585Z
---

`/pcp/romaneios-antigos` + `lib/importar-romaneios.js`: lê os FORM 22 de
`{OP}/4. Expedição/4.2 Romaneios` e grava `Romaneio` + `RomaneioItem`, marcando a peça como
**EXPEDIDO** (sai das filas de produção).

**Por que existe** (Vitor, 19/08/2026): as OPs antigas foram expedidas antes do fluxo do portal,
e o papel só está na pasta. Sem isso o portal dá como pendente peça que já está montada na obra —
na **OP-060, 43 das 44 "em aberto" já tinham sido embarcadas**. Vitor cobrou: *"mas pq vc não
analisou os romaneios das pastas das OPs? esse roteiro que criamos ainda não está em funcionamento"*
— eu tinha olhado as **tabelas do portal**, que estavam vazias, e concluído que não dava.

⚠️ **SÓ OBRA ANTIGA.** Nas novas o romaneio nasce no portal; o import **recusa** OP com
`RomaneioPrevio` emitido (071 e 098 foram barradas sozinhas).

🚨 **ROMANEIO EMITIDO ≠ ROMANEIO EMBARCADO.** O FORM 22 pode sair no papel **antes de a peça
existir** — foi o romaneio 02 da OP-104 (Vitor, 19/08: *"o romaneio 2 foi emitido porém não foi
fabricado ainda… precisa voltar as peças para op"*). **Nada no arquivo distingue** — a "data de
saída" já vem preenchida. Por isso o import **exige escolher** quais romaneios embarcaram
(`somente: [números]`); sem escolha não grava nada, e na tela cada romaneio tem checkbox começando
**desmarcado**. Ocorreu só nessa OP; as outras seis importações ficaram válidas.

## Armadilhas (todas custaram retrabalho)

1. **Item comprado e grade TAMBÉM são entregues.** `ehItemComprado` tira do *fluxo de fabricação*
   (não fazemos parafuso nem grade) — usar esse filtro no casamento deixava degrau e parafuso
   pendentes depois de já terem saído. No casamento do romaneio **entra tudo**.
2. **A mesma peça existe 2× (LPC e LE) com a marca escrita diferente**: `T104-AC5` na LE ×
   `T104AC-005` na LPC. Casar uma deixava a gêmea pendente pra sempre. 2º passe por **chave
   frouxa** (tira hífen/ponto e o zero-padding do número final) e marca **todas** as peças da
   mesma chave.
3. **Peso**: `"127.75"` (ponto decimal) × `"1.234,56"` (pt-BR) — só tratar ponto como milhar
   **quando há vírgula**. Sem isso os totais saíam 100× inflados.
4. **Croqui nunca vai sozinho no romaneio** — embarca dentro do conjunto. Conferir depois do
   import que nenhum croqui virou EXPEDIDO é um bom teste de sanidade.

## Layout do FORM 22

Cabeçalho com `N° | R01.` e `DATA DE SAÍDA: | 7/20/26` (m/d/aa) nas ~30 primeiras linhas; a tabela
começa na linha de títulos que tem **"Marca"** (Marca | Qte. | Unid. | Pos. | Descrição | Peso).
Romaneio antigo em `.xls` sem esse layout não abre — **11 dos 52 da OP-064** ficaram de fora, e a
tela lista quais.

Importado em 19/08/2026: 060, 064, 067, 083, 085, 092, 104 — 95 romaneios, ~5.500 itens,
**3.100+ peças** que estavam falsamente em aberto. Ver [[torg_status_obra]] e
[[torg_romaneio_carga]].
