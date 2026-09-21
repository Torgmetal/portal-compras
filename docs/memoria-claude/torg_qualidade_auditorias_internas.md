---
name: torg_qualidade_auditorias_internas
description: Qualidade › Auditorias Internas — cronograma + relatório enxuto divulgado ao setor por e-mail (≠ Auditorias Externas)
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-08-04T21:30:56.021Z
---

Módulo **Auditorias Internas** (`/qualidade/auditorias-internas`), commit 47552a4 (17/07/2026). Acesso ADMIN/QUALIDADE. Requisito ISO 9001 / NBR 16775.

⚠️ **NÃO confundir com "Auditorias Externas"** (`/qualidade/auditorias`, model `Auditoria`/`AuditoriaDoc`) — essa é o portal de documentos p/ certificadora/cliente auditar a Torg (token público, checklist GQ-FQ-003). As Internas são a Torg auditando os próprios setores. São coisas diferentes; ambas no menu da Qualidade.

- **1 entidade = 1 auditoria** (`model AuditoriaInterna`, numeração `RAI-001`): a linha do cronograma que depois recebe o relatório. Status AGENDADA → REALIZADA (tem conteúdo) → EMITIDO (divulgado, rótulo "Em acompanhamento") → **FINALIZADO** (commit 947d660, 04/08/2026).
- **Acompanhamento das ações + finalização** (947d660): cada item de `acoes` ganhou `resposta` + `evidencias:[{url,legenda}]` (fotos, mesmo endpoint `/foto`) + `concluida` + `respondidoEm`. O relatório fica **em aberto** enquanto houver ação não concluída; o botão **Finalizar** (faixa após a Conclusão) só habilita quando `podeFinalizar(a)` = status EMITIDO && sem pendente (helpers em `lib/auditoria-interna.js`). Finalizar → `status=FINALIZADO` + `finalizadoEm`; ADMIN pode **Reabrir**. Gate revalidado no PATCH (`finalizar`/`reabrir`). Coluna `finalizadoEm` via ensure-mes (idempotente; db push travado por drift).
- **Abas**: Cronograma (data/setor/resp/auditor/situação — mostra nº de ações em aberto) · Relatórios (constatações/NCs) · Plano de Ação (5W2H `PlanoAcao`/PA-xxx, é OUTRO modelo, ver [[torg_qualidade_plano_acao]]) · **Histórico** (só FINALIZADO). Cronograma/Relatórios listam só as **previstas** (não-finalizadas).
- **Relatório ENXUTO** (escolha do Vitor, não o ISO completo): identificação + `constatacoes` Json `[{tipo: CONFORME|NAO_CONFORME|MELHORIA, descricao}]` + **`fotos` Json `[{url,legenda}]` (registro fotográfico, commit 2355a6b)** + `acoes` Json (ver acima) + `conclusao`. Upload em `/api/qualidade/auditorias-internas/foto` (Blob; front reduz canvas→JPEG); PDF embute em grade 2-col (porte do `desenharFotos` do Relatório de Status).
- **PDF das constatações**: o número (1., 2.…) era desenhado em x=M e a barra colorida também (comia o dígito) — corrigido 04/08 (2a507fc): número em x=M+12, rótulo/descrição em x=M+32. PDF finalizado mostra status/resposta/nº-evidências por ação + carimbo "finalizado".
- **PDF**: `lib/auditoria-interna-pdf.js` (padrão Torg navy+laranja+logo, validado). Consts em `lib/auditoria-interna.js` (puro, client+server).
- **Divulgação = "só e-mail com PDF"** (escolha do Vitor; SEM aceite/ciência): `POST /[id]/divulgar` manda o PDF anexo aos e-mails digitados e marca EMITIDO; usa `cabecalhoEmail()` de [[torg_email_padrao]].
- **Resposta das ações é SÓ no portal, pela Qualidade** (decisão do Vitor, 04/08): NÃO fazer link/token pro setor responder por fora (diferente de ata/tarefa). O auditor da Qualidade vai aos setores, coleta as evidências e preenche resposta+foto+concluída ele mesmo. Não repropor fluxo de token aqui.

- **Revisão do cronograma sobe SÓ no envio para assinatura** (Vitor 27/08/2026), e só se o conteúdo mudou desde o último envio — reenviar p/ incluir destinatário não cria revisão. Antes subia a cada inclusão/edição/exclusão e chegou a R14 sem nunca ter sido emitido (zerada p/ R00). Cada envio grava um snapshot; `lib/cronograma-auditoria-revisoes.js` compara os snapshots e a página **/qualidade/auditorias-internas/revisoes** mostra o que mudou em cada revisão + o que ainda não foi emitido. Ver [[torg_assinatura_doc]].
- **"Atrasada" só depois que o DIA passa**: a data é gravada ao meio-dia UTC, então comparar com `new Date()` marcava como atrasada a auditoria de HOJE a partir das 9h BRT. Comparar dia-calendário BRT (`diaBRT`/`hojeBRT`) — ver [[torg_fuso_servidor]].

Padrão espelha ata/relatório de status. Ver [[torg_qualidade]].
