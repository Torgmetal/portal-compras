# Comparação IFC opcional no portal do cliente

Implementação vinculada ao seletor existente de documentos de Engenharia / Modelo 3D. O IFC atual continua sendo um documento escolhido; `comparacaoIfc: { publicar, anterior }` é armazenado nesse documento em `docsPorArea.ENGENHARIA`, sem migração de schema.

## Fluxo

1. Selecionar o IFC atual.
2. Clicar em “Selecionar IFC anterior no servidor”, navegar pelas pastas existentes e usar “Usar como anterior”. Navegação preserva a seleção ainda não publicada.
3. Marcar “Mostrar comparação ao cliente”, desligado por padrão e novamente desligado ao trocar o arquivo anterior.
4. Publicar a seleção no botão existente. O IFC anterior é vinculado à comparação, não acrescentado automaticamente à lista de documentos correntes.
5. Cliente encontra “Comparar com revisão anterior” apenas no modelo autorizado. Desmarcar e republicar remove o acesso à comparação.

Seleciona arquivos do SharePoint já usados pelo fluxo do projeto. Não implementa upload direto do computador. O cadastro valida os arquivos no Graph (IFC, OP, tamanho e IDs distintos), grava metadados canônicos e registra a decisão na auditoria.

## Acesso e carregamento

A rota de modelo mantém as verificações de status, expiração e seção do portal. Download da revisão anterior exige vínculo publicado com o modelo atual; não aceita seu ID como modelo independente. Comparação usa `no-store`; modelos normais preservam o cache existente. Se o eTag mudou desde a seleção, a comparação exige republicação. Recurso dinâmico: só baixa o IFC anterior e carrega o comparador após o clique. Nenhuma obra existente é ativada automaticamente.

O cliente precisa receber a geometria para visualizá-la; desligar posteriormente não apaga cópias já baixadas. A publicação continua sendo uma decisão explícita por obra/arquivo.

## Comparação

- Associa apenas GlobalIds únicos; marca não é chave. Ausentes/duplicados ficam “A conferir”.
- Hash SHA-256 de triângulos em coordenadas comuns, quantizadas em 1 mm, independentes de ordem e orientação dos índices. Detecta diferenças de geometria/posição; a triangulação diferente também pode sinalizar mudança. Quantização não equivale a teste de distância geométrica exato.
- Compara nome, tag/marca e classe; não compara todos os property sets, cor/material nem faz análise de impacto técnico.
- Referência espacial preservada, sem recentrar os IFCs independentemente. Render usa origem comum para reduzir perda de precisão.
- Verde adicionado, vermelho removido, amarelo alterado (ambas as geometrias), roxo a conferir. Contexto opcional, filtro, busca e foco a partir da lista.
- Limites: 60 MB por IFC, 50 mil elementos e 4 milhões de vértices por modelo. Sem benchmark de aparelhos de clientes. Arquivos com poucos GlobalIds em comum recebem aviso de possível mudança de escopo/identificadores.

## Validação local

`node scripts/ifc-comparacao/servir.mjs` abre http://127.0.0.1:3114 com os componentes reais, IFCs sintéticos e API em memória. O botão Publicar desse ensaio não chama banco, Graph ou portal real. O teste OP89 usa `/private/tmp/op089-modelo.ifc` já disponível neste computador.

14 testes automatizados: classificações, identificadores ambíguos, deslocamento/ordenação de triângulos, autorização explícita, download direto recusado, portal não publicado e arquivo substituído. ESLint sem erros (avisos de complexidade/tamanho). Navegador: mesmo IFC sintético = 36 iguais; par sintético controlado = 1 inclusão, 1 remoção, 1 alteração de nome e 34 iguais. Seleção em outra pasta, flag desligada, publicação e recarga verificadas com API simulada.

Não foram selecionadas nem publicadas revisões de nenhuma obra real. Falta um par de revisões reais do mesmo escopo para validação da Engenharia.

Teste adicional com IFC real OP89 contra ele próprio: 3.336 elementos iguais, 0 adicionados, 0 removidos, 0 alterados, 0 a conferir; sem erros no console do navegador. Este ensaio valida a repetibilidade do carregamento real, não substitui um par real de revisões.
