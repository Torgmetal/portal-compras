# Exemplos locais com IFC da OP89

Protótipo solicitado por Vitor: ligação explodida, sequência de montagem e comparação de revisões. Não integrado ao portal nem publicado na Vercel.

Fonte: `T89AC-PLATAFORMA AZ10 E CABLE RACK_20-08-26.ifc`, 5.830.289 bytes, cópia local em `/private/tmp/op089-modelo.ifc`. Extração web-ifc gera 17.171 colocações geométricas e 1.826 geometrias únicas. As coordenadas e índices vêm do arquivo; a apresentação aplica recorte e deslocamentos ilustrativos.

## Executar

```sh
node scripts/ifc-propostas/extrair.mjs
node scripts/ifc-propostas/servir.mjs
```

Abrir http://127.0.0.1:3113. O servidor escuta apenas loopback. Dados extraídos ficam em `/private/tmp/op089-propostas.json`, fora do Git. Usa dependências já instaladas; nenhum banco ou integração no servidor do protótipo.

## Limites de interpretação

- Ligação: recorte espacial de 0,86 m próximo ao elemento #845, região dos contraventamentos T89C87/T89C94/T89C89. Proximidade não comprova conexão topológica. Explosão radial ilustrativa; recorte não fecha superfícies cortadas. Não divide porcas/arruelas quando exportadas numa única geometria.
- Sequência: quatro faixas espaciais do modelo, sem datas. Não deriva plano de montagem, estabilidade, içamento ou liberação técnica. Em produto, deve receber etapas aprovadas de Engenharia.
- Revisão: Graph retornou somente versão 1.0 do arquivo completo, de 20/08/2026. Os demais IFCs listados têm escopos distintos e não comprovam par comparável. Adição (cópia +0,45 m), remoção e deslocamento (+0,25 m) são SIMULADOS sobre conjuntos reais. Nenhuma mudança foi constatada na obra. Não há algoritmo de comparação real implementado.

## Verificação

Compilação esbuild e sintaxe Node aprovadas. Conferência em navegador do recorte montado/explodido, passos da sequência, reprodução e sobreposição/isolamento das diferenças. Layout responsivo conferido no navegador. O desempenho deste protótipo não representa o viewer de produção: aqui as geometrias já são extraídas previamente para JSON.

## Revisão após feedback sobre os furos

Inspeção das chapas #1034/T89C150, #1141/T89C154, #1173/T89C153, #26161/T89C151 e #26224/T89C149: todas têm representação SweptSolid com perfil externo sem InnerCurves; malhas com 20, 20, 28, 32 e 20 triângulos. Não há IfcOpeningElement nem IfcRelVoidsElement neste arquivo. Isso confirma ausência de furos nas cinco chapas examinadas, não em todas as peças do modelo. Nenhum furo foi inventado. Botão Chapa inteira mostra #1034 sem recorte nem deslocamento, para inspeção. Sequência de montagem retirada da navegação conforme a prioridade indicada por Vitor; código do ensaio preservado.
