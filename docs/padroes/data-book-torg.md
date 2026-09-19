# Padrão visual de data book Torg

Aprovado por Vitor em 19/09/2026 nesta conversa.

## Referência aprovada

`output/pdf/Previa-Data-Book-Torg-por-TAG-TPR.pdf`

Modelo com logo Torg, fundo branco, títulos em azul institucional, laranja discreto, tabelas claras e identificação da obra e TAG/TPR em destaque. Segue a identidade visual do memorial aprovado.

Para múltiplas partes no mesmo volume, referência aprovada: `output/pdf/Previa-Data-Book-Torg-TPR-701-702.pdf`. Identificações separadas na capa, sem sinal de soma.

## Organização a partir do Comercial

Regra aprovada expressamente por Vitor em 19/09/2026 ("ok pode adotar isso"). Deve orientar as novas obras e a integração ao gerador, que ainda está pendente:

- Reutilizar as referências individuais cadastradas pelo Comercial (`OPReferencia`), preservando o rótulo do cliente (TPR, OC, TAG etc.) e a relação entre pedido e suas partes.
- Referências que identificam a mesma parte não geram capítulos duplicados: o pedido pode agrupar as TAGs e a identificação da parte deve exibir os códigos correspondentes.
- Cada parte selecionada para o book terá seção própria de projetos, rastreabilidade e inspeções. O cadastro comercial define a estrutura; o conteúdo depende do vínculo conferido com fases, peças e documentos.
- Documentos comuns aparecem uma vez, com referências nas partes às quais se aplicam. Pertencer à mesma OP não comprova aplicabilidade a todas as partes.
- Documentos sem vínculo ficam pendentes de classificação na preparação interna, sem distribuição automática arbitrária.
- Novas partes e aditivos entram na próxima prévia; documentos já emitidos permanecem preservados e alterações seguem revisão controlada.
- Permitir reunir partes no mesmo volume ou selecionar uma parte para emissão individual, mantendo o padrão visual aprovado.

## Aplicação

- Aplicar às obras que nunca tiveram data book emitido, incluindo os rascunhos já cadastrados. Correção de escopo confirmada por Vitor em 19/09/2026.
- Obras com emissão anterior mantêm o modelo original, inclusive ao abrir novas revisões. Não substituir documentos emitidos.
- Dividir por TAG/TPR/equipamento quando a obra exigir; a aprovação visual não exige subdividir todas as obras por TAG.
- Preservar os originais anexados, inclusive revisões, carimbos e assinaturas.
- A prévia contém campos demonstrativos: preencher com dados verificados na emissão.
- Separar orientações e pendências internas do conteúdo destinado ao cliente.

## Situação

Template visual integrado aos PDFs e volumes por `DataBookQualidade.templateVisual`, persistido como LEGADO ou TORG_2026. Bootstrap classifica os registros existentes uma única vez; revisões preservam a escolha. Referências do Comercial são exibidas na capa. A distribuição automática do conteúdo por parte (projetos, peças, relatórios e documentos compartilhados) ainda exige integração própria e não deve ser apresentada como pronta.
