---
name: torg_relatorios_sais_poeira
description: Relatórios de SAIS (RCS, ISO 8502-6/9) e POEIRA (RTP, ISO 8502-3) — modelos do SGQ; acompanham a pintura no escopo; uma regra de gravação para as duas rotas; densidade pela ISO 8502-9; laudo da poeira = resultadoInspecao
metadata:
  type: project
---

Vitor (02/10/2026): *"preciso incluir na aba inspeções e na aba inspeção de campo os relatórios de salinidade
e poeira (…) garanta que todos os campos de informações tenham como preencher (…) coloque mais de um agente
para verificar todos os modelos e gerar relatórios de teste"*.

- **Modelos:** SharePoint `Administrativo/Modelos de Documentos/Relatórios de Inspeção da Qualidade`.
  - São 10 ao todo: Dimensional, Ensaio US, LP, Pintura, **Poeira**, Pré-montagem, Pull-off, Recebimento de Tintas, **Sais**, Visual Solda.
  - ⚠ Fica em `Administrativo/Modelos de Documentos`, NÃO em `Administrativo/SGQ ISO 9001-2015`. A busca por "modelo" dentro do SGQ não acha.
  - Pull-off e Recebimento de Tintas ainda não têm tipo próprio no portal.
- **Tipos:** `SAIS` (sigla RCS) e `POEIRA` (RTP), na §14 do data book. Na lista, ficam antes da Pintura (ordem do processo).
- **Código:**
  - regras: `lib/sais-campos.js`, `lib/poeira-campos.js`;
  - PDF: `lib/relatorio-sais-pdf.js` e `lib/relatorio-poeira-pdf.js`, com a moldura comum em `lib/relatorio-superficie-pdf.js`;
  - telas: `FormSais` e `FormPoeira` (computador), `FormularioSaisCampo` e `FormularioPoeiraCampo` (celular).
- ⚠⚠ **AS DUAS ROTAS DE GRAVAÇÃO TÊM LISTA FECHADA** e descartam em silêncio o que não está nela. Os dois tipos passam por `lib/superficie-gravacao.js`, chamado pelas duas rotas. As amostras e os testes são LISTAS: no laço de texto virariam "[object Object]".
  - O teste `sais-poeira-gravacao-rotas` cobra cada campo nas duas rotas, e foi conferido que ele falha sem a mudança.
- ⚠⚠ **SAIS E POEIRA ACOMPANHAM A PINTURA NO ESCOPO** (`TIPOS_DA_PINTURA` em `lib/qualidade-escopo.js`). Não viram caixa própria no escopo da OP.
  - Onde a obra tem pintura, os dois ficam disponíveis — inclusive em escopo salvo antes deles. Sem isso a criação dava 409 e o celular nem os listava.
  - O Completo salvo continua casando com o Completo.
- **Densidade de sais:** pela ISO 8502-9, ρ = 5·V·Δγ/A (V em ml, Δγ em µS/cm, A em cm²). Com o Bresle padrão (3 ml, 12,5 cm²) dá 1,2 × Δ.
  - A planilha deixava a densidade para digitar. O portal calcula quando ela fica vazia, e o valor digitado (lido no aparelho) vale mais. O PDF marca com * a densidade calculada.
- **Laudo:**
  - Sais: a conta da planilha (média ≤ requisito). O "Resultado da inspeção" marcado à mão não pode contrariá-la: vira pendência e trava o envio para assinatura.
  - Poeira: o modelo não tem requisito, então o laudo é o `resultadoInspecao` geral — um lugar só. A "classificação das partículas", que não tem fórmula no modelo, é sugerida pela MAIOR classe encontrada e é editável.
- **Nasce preenchido** (`lib/padroes-inspecao.js`), com memória por obra:
  - PO-05 como documento de referência;
  - ordem de compra = pedido do cliente no Kick Off (`dadosDaObra`);
  - Bresle 3 ml / 12,5 cm², "Condutivímetro", termômetro TM-01;
  - fita "conforme ISO 8502-3 (25 mm)", "Lupa 10×".
  - ⚠ O condutivímetro NÃO está no mapa de calibração (30 instrumentos, nenhum). O requisito também não nasce, porque é critério do contrato.
- **Celular:** `TIPOS_SEM_JUNTA` / `semJunta` em `lib/qualidade-campo.js`. Sem essa lista, um tipo novo caía nos controles do visual de solda (iluminação, junta soldada, Ler QR/Digitar).
- **Reinspeção:** `proximaRevisao` limpa `resultados.amostras`, `resultados.testes` e a classificação. As leituras moram em `resultados`, não nas linhas.
- ⚠ **A fonte do PDF é WinAnsi:** Δ, ρ e γ não imprimem. No PDF é "Diferença de condutividade", na tela continua "Δ". (≤ e ≥ viram "<=" e ">=" no `san` desde 02/10 — ver [[torg_pdf_relatorios_fluxo]].)
- ⚠⚠ **LEITURA DE APARELHO NÃO PASSA POR `numeroBR`.** Ele lê "0.125" como 125 (milhar de preço). `numeroMedida` (`lib/sais-campos.js`): ponto e vírgula são decimais, e lixo ("1e3", "12 a 14") é `null`. A média usa `arredondar` (ROUND do Excel, sem o 12,249999…).
- **Data do ensaio** (`dataInspecao`, `<input type="date">`): é o campo DATA do modelo. Sai sem fuso ("aaaa-mm-dd" → dd/mm/aaaa direto); vazio cai na emissão/criação. A rota só aceita data de verdade; a reinspeção limpa.
- **Avisos, não travas:** densidade digitada > 20% longe da calculada (sais); classificação marcada abaixo da maior classe encontrada (poeira — o PDF imprime "(maior encontrada: N)"). **Trava (pendência):** aparelho sem modelo/tag; volume/área ≤ 0 ou ilegível (vazio vale o padrão, como no PDF); amostra com condutividade menor que a da água. O LOCAL do teste de poeira é opcional (a planilha não exige).
- No computador a hora da amostra NÃO nasce sozinha (ali se passa a limpo depois); no celular nasce.
- **RNC** aberta pelo celular descreve as leituras (média × requisito, amostras / testes), não mais "Sem detalhamento".
- **PDF em folhas que fluem** (`lib/relatorio-fluxo-pdf.js`, ver [[torg_pdf_relatorios_fluxo]]): relação de peças com mais de 6 linhas manda o resto para "RELAÇÃO COMPLETA" no fim; fotos 1 e 2 só ficam no corpo se couberem (senão vão todas para a folha de fotos).
- **Commits:** `030ab8ce` (texto que derrubava o PDF, todos os tipos) e `9fa3355e` (os dois relatórios), 02/10/2026.
- ⚠ **O `preview_start` sobe o checkout principal, não a worktree.** A validação foi feita por testes (jsdom, rotas com mock, PDFs reais lidos de volta com `unpdf`, inclusive a POSIÇÃO de cada texto) e por 4 agentes de verificação.

Ver [[torg_pintura_duas_telas]], [[torg_sgq_form_identificacao]], [[torg_calibracao]].
