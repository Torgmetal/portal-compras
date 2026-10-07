---
name: torg_relatorios_pulloff_recebimento
description: Pull-off (RPO, ASTM D4541) e Recebimento de Tintas (RRT) — os dois últimos modelos do SGQ; regras do resultado, da data e do dolly sem ruptura; o que prendia relatórios em todos os tipos
metadata:
  type: project
---

Vitor (02/10/2026): *"pode criar também, vamos deixar tudo funcionando, faça o mesmo teste, garanta que nada fique travado"*. Com eles, os 10 modelos de `Administrativo/Modelos de Documentos/Relatórios de Inspeção da Qualidade` têm tipo no portal (ver [[torg_relatorios_sais_poeira]]).

- **Tipos:** `PULL_OFF` (sigla RPO) e `RECEBIMENTO_TINTA` (RRT), os dois na **§14**. Acompanham a PINTURA no escopo (`TIPOS_DA_PINTURA`).
- **Código:** regras em `lib/pulloff-campos.js` e `lib/recebimento-tinta-campos.js`; PDF em `lib/relatorio-pulloff-pdf.js` e `lib/relatorio-recebimento-tinta-pdf.js`; telas `FormPullOff`/`FormRecebimentoTinta` (computador) e `Formulario*Campo` (celular). Gravação pela lista fechada única de `lib/superficie-gravacao.js`, que agora filtra **por tipo** (o celular manda as chaves da família inteira).
- ⚠⚠ **O recebimento NÃO vai na §15** ("Certificados / lotes de tintas"), apesar do nome. A §15 é de vínculo AUTOMÁTICO de certificados (`SECOES_AUTOMATICAS`): o cron mede a "última montagem" pelo documento mais novo da seção, e o PDF lista tudo como rastreabilidade (R, corrida). Um relatório ali apareceria como "material" e atrasaria o vínculo de certificados. Teste: `relatorio-secao-databook`.
- ⚠⚠ **Resultado do recebimento:** item reprovado ou lote vencido EXIGEM reprovar; reprovar com tudo aprovado é permitido (produto trocado, sem certificado…), com o motivo nas observações. A regra antiga ("o resultado tem de bater com os itens") deixava lote vencido + 9 itens aprovados **sem saída nenhuma**. O resultado sai impresso numa linha que o modelo não tem — sem ela, um reprovado com os 9 itens aprovados não diria que reprovou.
- ⚠⚠ **A validade é conferida contra a data que o PDF IMPRIME** (`dataReferenciaRecebimento`: a digitada, ou o dia da emissão/criação em São Paulo), **nunca contra hoje**: o PDF é regerado a cada pedido, e contra hoje um relatório assinado passaria a dizer "vencida".
- **Validade em branco avisa, não trava** (componente sem data no rótulo obrigaria a inventar uma). Material, certificado e norma do "Preencher pelo CMR" vêm do componente **A**; o CMR só preenche o que está vazio.
- ⚠ **Dolly sem ruptura** (ASTM D4541): "> 20" ou a falha "Sem ruptura" (no celular o teclado numérico não tem ">"). Entra na média **pelo limite**, e a média sai com ">" — é um mínimo. Decisão minha; a planilha ignoraria o texto no AVERAGE.
- ⚠ **Nº da RNC do pull-off** sai sozinho da RNC aberta pela reprovação — em TODO caminho que gera o PDF (`lib/relatorio-rnc.js`: tela, link de assinatura, anexo do e-mail, cópia arquivada) e **só com laudo reprovado** (a RNC é uma por relatório, e o R01 aprovado sairia com a do R00).
- **REC** ("exame complementar", termo de END) não aparece nos ensaios de superfície nem no recebimento (`resultadosDaTela`).
- **O que prendia relatórios em todos os tipos** (verificador das travas): quantidade do dimensional sem tela; celular travado por quantidade em branco não tocada; soldador do EVS (lista do RH, terceiro não entrava); vírgula no valor de projeto da cota (virava NaN) e valor de projeto não editável; pré-montagem que o celular não cria (nasce do projeto); lista de Inspeções cortando em 100; EVS sem peça; instrumento que saiu da lista sem poder desmarcar; reinspeção pelo celular mantendo o envio do R00 (o R01 escapava da trava e herdaria as assinaturas). O meta-teste `testes/api/travas-resolviveis.teste.js` prova, tipo a tipo, que um relatório completo pelas duas rotas não sobra pendência.
- ⚠ **Observações:** a rota do celular cortava em 1000 e devolvia em toda gravação — o texto longo do computador perdia o fim. Teto único `LIMITE_OBSERVACOES` (20.000) nas duas rotas.
- **Commits:** `4878962c`, `577219fb`, `75c6cb1f`, `0492787e` (02/10/2026). Verificação: 3 agentes (um por modelo + um caçando travas), PDFs nos limites lidos de volta com `unpdf` e olhados no `sips` ([[torg_pdf_relatorios_fluxo]]).
- **Desde 07/10/2026 o recebimento de tintas nasce dos CERTIFICADOS do CMR, não de peças** (até 3, nos lotes A/B/C) — ver [[torg-recebimentos-certificado]].
