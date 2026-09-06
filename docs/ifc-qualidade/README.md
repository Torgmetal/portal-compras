# Ensaio local de qualidade IFC

**Estado atual:** o perfil Nítido foi revisto após analisar o vídeo do Trimble enviado por Vitor. A seção final descreve a versão vigente; as etapas anteriores preservam o histórico dos testes e suas medições. Vitor aprovou a publicação: o perfil Nítido passa a ser o padrão compartilhado por Produção e Portal do cliente. As menções abaixo a opt-in e ausência de publicação registram as etapas anteriores.

No início do ensaio, o componente compartilhado mantinha o visual atual por padrão. O perfil **refinado** é um experimento opt-in, sem publicação, merge, alteração do IFC ou novas dependências de produção.

## O que foi escolhido

- Iluminação: ambiente de 0,95 para 0,70; luz principal de 0,75 para 0,85; preenchimentos de 0,35/0,20 para 0,22/0,16. O objetivo é diferenciar faces sem aumentar o número de luzes (uma hemisférica + três direcionais).
- Material: continua Phong, com brilho de 14 para 24 e reflexo neutro/discreto (0x181818). Cores IFC, cores por tipo, andamento e seleção continuam pelo mesmo caminho, sem conversão de cor adicional.
- Resolução: preserva DPR nativo até 2 e limita o buffer do ensaio a 3 milhões de pixels; recalcula no resize. Em telas muito grandes pode ficar abaixo de DPR 1: esse é um compromisso deliberado de nitidez por custo, ainda a validar com usuários.
- Contornos: mantidos, incluindo teto de 6.000 geometrias e uma única malha de linhas. Não duplicar esse custo em modelos grandes.
- Antialiasing: mantém o MSAA já habilitado no WebGLRenderer. Sem FXAA, SSAO, mapas de sombra, HDR, texturas ou pós-processamento. Não há passes extras nem alteração na malha IFC.
- Fundo branco, câmera, filtros, agrupamento, carregamento em lotes e desenho sob demanda permanecem no caminho existente.

## Como testar sem login

Na raiz deste worktree, com as dependências do projeto instaladas:

```sh
node scripts/ifc-qualidade/servir.mjs
```

Abra http://127.0.0.1:3109. O servidor usa esbuild (já presente no lock via ferramentas de desenvolvimento), serve somente o ensaio e recursos locais, e escuta apenas no loopback. Não carrega Next, banco, credenciais ou integrações. Pare com Ctrl+C.

1. Abra **Atual** e **Refinado**, na mesma janela. Após carregar, use **Isométrica** em ambos.
2. O IFC sintético tem 36 conjuntos: colunas, vigas com perfil I e chapas, sem dados de clientes. Ele passa pelo web-ifc e pelo componente real, não por uma réplica do renderizador.
3. Para comparar um IFC real, use o seletor de arquivo. Ele é lido por URL de blob somente no navegador, sem upload. Se trocar de perfil, selecione o mesmo arquivo novamente.
4. Experimente clique, zoom, vistas, foco na seleção, filtro translúcido, ocultação e cor por andamento.
5. **Medir 120 vistas** alterna Frente/Lateral uma vez por requestAnimationFrame. Faça isso sem filtros, após a carga e ociosidade inicial, mantendo a aba visível e o mesmo tamanho de janela. Recarregue entre perfis.

Nas abas reais em `npm run dev`, acrescente `ifcVisual=refinado` à query string e recarregue a página (use `&` se já houver parâmetros). Retire o parâmetro para voltar ao atual. Esse parâmetro só é lido em desenvolvimento. A prop `perfilVisual="refinado"` é usada pelo ensaio separado; nenhum consumidor de produção foi alterado para ativá-la.

## Evidências em 06/09/2026 (UTC)

[Antes](atual.png) · [Depois](refinado.png) · [Medições brutas](medicoes.json)

Capturas com vista Isométrica, viewport de 1500 × 1000, canvas de 1452 × 640 e DPR 1 no navegador integrado do Codex. A diferença é discreta: iluminação de preenchimento menor e faces menos claras. Não é uma aprovação estética para todas as obras.

| Medida no ensaio sintético | Atual | Refinado |
| --- | ---: | ---: |
| Conjuntos / peças carregados | 36 / 36 | 36 / 36 |
| Desenhos WebGL por quadro | 37 | 37 |
| Triângulos por quadro | 1.680 | 1.680 |
| Quadros contados | 121 | 121 |
| Intervalo mediano entre callbacks | 16,7 ms | 16,7 ms |
| Intervalo p95 entre callbacks | 17,7 ms | 17,6 ms |
| Buffer de desenho | 1452 × 640 | 1452 × 640 |

Uma execução por perfil, com instrumentação no protótipo WebGL2 apenas no ensaio. `clear` conta quadros neste renderer; `drawElements`/`drawArrays` contam desenhos e triângulos. O quadro adicional fecha a última troca. Os tempos são intervalos de requestAnimationFrame, **não tempo de GPU nem benchmark representativo de uma obra grande**. A diferença de 0,1 ms é ruído, não ganho comprovado. Não foi medida memória de GPU, tempo de download nem desempenho em computadores de clientes.

O teto de resolução foi verificado por testes: por exemplo, um canvas de 1920 × 1080 em DPR 2 iria de 8.294.400 pixels para no máximo 3 milhões. Isso é redução calculada do buffer, não redução medida de tempo ou memória total. A captura acima não aciona o teto.

Validação funcional no componente real com o IFC sintético: carregamento, vistas Frente/Lateral/Isométrica, filtro translúcido, ocultação sem contorno residual, seleção `a23` por clique e foco na seleção. O destaque laranja permaneceu após trocar o modo de cor. As integrações com os painéis reais não foram validadas com sessão autenticada.

Validação automatizada:

```sh
node node_modules/vitest/vitest.mjs run testes/unidade/ifc-visual.teste.js
node node_modules/eslint/bin/eslint.js components/VisualizadorIfc.jsx lib/ifc-visual.js
```

Três testes passaram; ESLint sem erros no componente e helper, com avisos de tamanho/complexidade do componente. Ensaio compilado com esbuild e executado no navegador. Next dev chegou a iniciar, mas a requisição de `/entrar` devolveu 404 neste ambiente: não equivale a uma validação integrada das abas. Não foi executado `npm run build`, cujo script também executa manutenção de tabelas MES; este teste isolado não precisa tocar o banco real.

## Limites e próximo passo

No primeiro ensaio, não foi localizado IFC real no repositório nem em Downloads. Essa limitação foi resolvida na etapa OP 89 descrita abaixo. A amostra sintética pequena não cobre obra com 13 mil peças, parafusos, revisões Tekla ou arquivo sem cores. Para concluir a avaliação de obra, basta informar o caminho local de um IFC representativo (idealmente uma obra grande e uma menor/colorida). Login não é necessário para o ensaio isolado. Até essa comparação, manter o perfil atual como padrão.


## Segunda etapa: IFC real da OP 89

Acesso de leitura ao SharePoint confirmado usando a integração existente do projeto principal. Foi baixado o arquivo `T89AC-PLATAFORMA AZ10 E CABLE RACK_20-08-26.ifc`, da pasta `2. Engenharia/2.5 Projetos/2.5.3 Modelo 3D`. Tamanho conferido: 5.830.289 bytes. O IFC fica somente em `/private/tmp/op089-modelo.ifc`, fora do Git e de public.

O componente contabilizou **17.171 geometrias**, 573 assemblies e 588 itens selecionáveis (incluindo agrupamentos de fixadores). Assim, o teto original de 6.000 geometrias desliga todos os contornos, mesmo sendo um IFC de apenas 5,8 MB. Isso explica uma perda de definição de quinas; não prova que seja a única diferença em relação ao Trimble.

Novo perfil **Nítido**, ainda opt-in:

- Preserva a resolução original (DPR até 2), sem o teto de 3 milhões de pixels do primeiro ensaio.
- Gera contornos de 25 graus somente para grupos sem fixadores identificados. Orçamento total de 200 mil triângulos de entrada para extração de arestas; grupos que não cabem são ignorados. É um limite de processamento, não de tamanho exato em memória. Pode haver contornos parciais em obras maiores.
- As linhas continuam agrupadas em uma única malha e seguem o comportamento existente de filtros/ocultação. Não muda a geometria dos sólidos nem os dados IFC.
- Clareia a luz hemisférica (1,1 e cor inferior 0xd8dde3), mantendo luzes direcionais e Phong do perfil original, para reduzir o escurecimento das faces. Nenhum mapa de sombra ou pós-processamento.
- O custo adicional é a extração/armazenamento das linhas e até uma chamada de desenho por quadro; não é uma melhoria gratuita. O limite precisa ser avaliado em computadores representativos.

Para repetir com um arquivo local:

```sh
IFC_ENSAIO_ARQUIVO=/private/tmp/op089-modelo.ifc IFC_ENSAIO_PORTA=3110 node scripts/ifc-qualidade/servir.mjs
```

Abra `http://127.0.0.1:3110/?perfil=nitido&modelo=local`. Os links Atual/Refinado/Nítido preservam o mesmo arquivo. Nas abas reais em Next dev, use `ifcVisual=nitido` e recarregue. O padrão das abas continua atual.

[OP 89 — atual](op089-atual.png) · [OP 89 — nítido](op089-nitido.png)

Quatro testes passaram, incluindo o orçamento cumulativo de contornos e exclusão de fixadores; lint sem erros. Não houve publicação, alteração no SharePoint, banco ou integração de produção. Ainda não há captura de referência do mesmo enquadramento no Trimble Connect: não foi comprovada equivalência visual com ele.

Medição da OP 89 com canvas fixo de **1000 × 640, DPR 1**, 120 trocas Frente/Lateral e 121 quadros contados. [Dados brutos](op089-medicoes.json):

| Medida | Atual | Nítido |
| --- | ---: | ---: |
| Desenhos por quadro | 851 | 852 |
| Triângulos dos sólidos por quadro | 714.237 | 714.237 |
| Intervalo mediano dos callbacks | 16,6 ms | 16,7 ms |
| Intervalo p95 dos callbacks | 17,7 ms | 18,0 ms |

Uma execução por perfil; variação pequena, sem conclusão de ganho de velocidade. Não mede tempo de GPU, consumo total de memória ou custo de carregamento/extração das arestas. O teste funcional de filtro seguido de ocultação deixou apenas o item filtrado, sem linhas residuais da obra. O modo de arquivo local fixa a largura em 1000 pixels para evitar comparações afetadas pelo redimensionamento do painel do aplicativo; em janelas menores haverá rolagem horizontal no ensaio.


## Terceira etapa: referência de vídeo do Trimble (versão vigente)

Vídeo enviado: `Gravando 2026-09-02 200758.mp4`, duração aproximada de 58 segundos. O nome na barra do Trimble corresponde ao IFC T89AC baixado. Foram inspecionados oito quadros distribuídos pelo vídeo, incluindo os detalhes de treliça e guarda-corpo. [Referência da treliça, aproximadamente 14 s](trimble-video-14s.png) e [referência dos perfis, aproximadamente 51 s](trimble-video-50s.png).

A referência mostra cores mais claras, contornos finos e variação suave de luz nos perfis. Há também facetas/linhas visíveis nos tubos em close; não é adequado atribuir toda a diferença a tesselação ou prometer eliminar todos os detalhes facetados.

O perfil **Nítido** foi atualizado:

1. Luz hemisférica de `0.78 × PI`, chão neutro `0xe8e8e8`, direcionais de `0.45 × PI`, `0.16 × PI` e `0.10 × PI`. O shader Phong desta versão do Three multiplica a irradiância por uma BRDF difusa dividida por PI (`lights_phong_pars_fragment` e `BRDF_Lambert` no código instalado). Os valores antigos deixavam as cores muito escuras; a nova escala recupera luminosidade mantendo as cores-base IFC e o caminho sRGB existente. É calibração visual, não prova de igualdade de gestão de cor com o Trimble.
2. Suavização das normais de faces com ângulo inferior a 40 graus na mesma geometria, antes da transformação/junção. Mantém posições, índices, quantidade de vértices/triângulos e quinas de 90 graus. Isso suaviza o **sombreamento** das curvas; não cria raios que não existam nem arredonda a silhueta geométrica.
3. Processa apenas grupos sem fixadores identificados; cache por geometryExpressID, até 200 mil vértices únicos, teto de 60 mil por geometria e de 64 entradas por posição coincidente. O cache é liberado antes da junção. Cada instância recebe uma cópia das normais para não transformar dados compartilhados. O peso IFC não muda; existe custo temporário de CPU e memória na preparação, ainda sem medição isolada.
4. Continua o limite de contornos estruturais e a resolução original. Sem sombras dinâmicas, novos render targets ou pós-processamento.

Foi investigado aumentar `CIRCLE_SEGMENTS` globalmente de 12 (padrão instalado do web-ifc) para 24. Em uma leitura Node do IFC real, os triângulos passaram de 714.237 para 1.338.304 (+87%), mantendo 17.171 partes. A opção **não foi aplicada ao visualizador**. Essa leitura em Node não representa tempo de GPU/navegador. Ambas leituras registraram avisos de curvas compostas auto-intersectantes presentes no processamento atual do arquivo.

[Antes no portal](op089-video-atual.png) · [Após ajuste guiado pelo vídeo](op089-video-ajustado.png). Mesma vista Isométrica e um clique em Aproximar, canvas de 1000 × 640; diferenças externas de janela/interface não são uma comparação pixel a pixel com o vídeo do Trimble.

[Medição da versão vigente](op089-video-medicoes.json): 852 desenhos e 714.237 triângulos por quadro, buffer 1000 × 640/DPR 1, mediana dos callbacks 16,7 ms e p95 17,9 ms. Os números de desenho e triângulos coincidem com o Nítido anterior. Uma execução, sem inferir ganho de velocidade ou representatividade de computadores de clientes. Seis testes passaram (incluindo preservação de quinas e entradas na suavização); ESLint sem erros, com avisos de complexidade/tamanho.

Limites: sem validação integrada/autenticada das abas, sem medida isolada de carregamento ou memória, sem teste em hardware de cliente e sem reprodução exata da câmera/material do Trimble. O resultado é uma aproximação visual local reviewável; nada foi publicado ou mesclado.

## Tempo de abertura e impacto no servidor

Após Vitor perguntar sobre abertura/custos, foram feitas seis navegações completas alternadas em localhost, três de cada perfil, no mesmo navegador/computador, com o IFC OP 89 de 5.830.289 bytes. A medida vai da montagem da página de ensaio até `onIndice`, chamado depois do primeiro envio de desenho pelo componente. Inclui imports dinâmicos, obtenção local do IFC/WASM, leitura, preparação e primeiro desenho; não mede rede de cliente, servidor Vercel nem apresentação física do quadro. As medições ocorreram após uma carga inicial e podem aproveitar cache do navegador.

[Registros brutos](op089-aberturas.json):

| Perfil | Abertura 1 | Abertura 2 | Abertura 3 | Mediana |
| --- | ---: | ---: | ---: | ---: |
| Atual | 3.276 ms | 3.202 ms | 3.224 ms | 3.224 ms |
| Nítido | 3.425 ms | 3.521 ms | 3.548 ms | 3.521 ms |

Acréscimo observado de **297 ms na mediana (9,2%)**, arredondado para 0,3 segundo. Amostra pequena em um único computador: não garante esse atraso em todos os clientes ou obras.

Nenhuma rota de API, chamada ao banco, integração ou arquivo IFC foi alterado pelo perfil. O novo trabalho de contorno/sombreamento roda no navegador. Há pequeno acréscimo de JavaScript entregue (os dois novos helpers somam cerca de 3,1 KB de fonte antes da compilação, além das alterações do componente; isso não é a medição do bundle Next comprimido). Não há chamada paga ou função Vercel adicional introduzida, mas não é correto prometer variação exatamente zero na fatura. O ajuste continua sem publicação/merge.

O botão **Comparar abertura (6 cargas)** permite reproduzir a sequência; usa apenas sessionStorage do ensaio para carregar os resultados entre navegações e não envia telemetria a serviço externo.
