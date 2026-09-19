# Template visual do data book

Objetivo aprovado: usar o visual branco Torg nos books sem emissão anterior, preservando o modelo das obras já emitidas, inclusive revisões futuras.

## Implementação
- [x] Persistir `templateVisual` no book, com migração idempotente que classifica os registros existentes uma única vez. Histórico de revisão, emissão ou assinatura mantém LEGADO; books em montagem sem esse histórico recebem TORG_2026. Criações futuras recebem TORG_2026.
- [x] Isolar capa e divisórias novas em `lib/databook-template-pdf.js`; deixar o renderer antigo intacto na ramificação LEGADO. Manter anexos originais, conteúdo e assinaturas.
- [x] Aplicar a mesma seleção aos volumes e mostrar o modelo ativo na tela.
- [x] Testar classificação, persistência na revisão, renderização de nomes longos e regressão do caminho legado; validar no servidor local com dados fictícios isolados.
- [ ] Revisar diff, publicar somente os arquivos dessa alteração e confirmar implantação.

O vínculo automático de documentos às partes exige identificação comprovada; esta alteração de template não inventa vínculos a partir do nome do arquivo.
