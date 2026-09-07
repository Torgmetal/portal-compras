# Terceiros: recebimento por remessa

A aba PCP > Terceiros abre os romaneios com saldo. O recebimento é compartilhado com a Expedição; registros legados sem romaneio permanecem na segunda aba.

- Informar OP, previsão e setor de retorno no romaneio. Romaneios antigos precisam de destino estruturado: o sistema não interpreta automaticamente a observação livre como destino.
- Registrar retorno manualmente ou importar XLSX/XLS/CSV/PDF. Planilha: OP, Marca, Quantidade. Conferir o documento, aplicar as quantidades e confirmar a baixa. Importar nunca grava um recebimento.
- A conciliação é restrita à remessa selecionada e exige OP e marca correspondentes. Documentos com várias remessas devem ser conferidos em cada uma. Linhas ilegíveis, repetidas, sem OP ou acima do saldo impedem aplicar a importação; podem ser corrigidas no arquivo ou preenchidas manualmente.
- O saldo é por quantidade, inclusive em itens sem peso. Retornos históricos sem quantidade exigem conferência; peso não é convertido em quantidade presumida.
- Cada retorno registra quantidade, destino, usuário, data e peso calculado do item enviado. Hash do documento e chave idempotente evitam repetir o mesmo recebimento. Concorrência usa versão do romaneio e trava transacional por OP.

## Gantt

A previsão é tracejada, na data prevista e sem bancada do setor industrial escolhido. Não consome capacidade nem pode ser arrastada. Clicar abre Terceiros. O saldo diminui nos recebimentos. Expedição não é setor industrial do Gantt: seu retorno permanece no romaneio/histórico, sem marcar material como expedido ao cliente.

Lotes recebidos nos setores industriais aparecem com quantidade e destino próprios, e podem ser arrastados para recurso e dia. A programação fica no item do retorno, preservando as quantidades parciais e o histórico. Não se altera a quantidade total da LPC para acomodar um recebimento parcial.

Os lotes usam ids `retorno:romaneio:retorno:indice`; não são ids de PecaConjunto. Não enviar esses ids às APIs de impressão ou quebra de conjuntos. O Gantt direciona a consulta do retorno à aba Terceiros. Salvar programação de retornos e de peças internas exige ações separadas. Arrastar de volta para sem bancada retira a programação do retorno, permitindo desfazê-lo.

A produção posterior ao registro é medida pelo Syneco, com início reservado por OP/marca/setor para não usar produção antiga como conclusão do novo retorno. Ao concluir a quantidade do lote, ele sai do quadro. Não cria apontamentos no Syneco. O recebimento por remessa não faz a baixa integral do cadastro legado de uma marca; essa rota é bloqueada para marcas vinculadas a romaneios, evitando liberar saldo que permanece no fornecedor.

## Verificação

Testes em `testes/lib/terceiros-*.teste.js` e `testes/api/terceiros-*.teste.js` usam Prisma simulado. A validação no navegador usa APIs interceptadas; nenhuma remessa de produção foi recebida como teste. A leitura de PDF usa a integração Anthropic existente e precisa da chave configurada; indisponibilidade não provoca baixa nem inventa linhas.
