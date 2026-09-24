# Auditoria das exportações Excel — 07/09/2026

## Escopo e padrão

As exportações geradas pelo portal passam pelo acabamento compartilhado de
`lib/excel-refinamento.js`, chamado por `downloadWorkbook` no navegador ou
`bufferWorkbookTorg` no servidor. O padrão acompanha a planilha da produção:
logo Torg, azul institucional, faixa laranja, identificação do relatório,
cabeçalhos legíveis, linhas alternadas, totais destacados, texto com quebra
conforme a largura final e impressão sem forçar toda a altura em uma página.

Relatórios de várias abas usam `adicionarFolhaTorg` em cada aba. Resumos de
poucas colunas recebem cabeçalho empilhado sem colunas extras. Filtros explícitos,
cores de status e fontes maiores de instruções de trabalho permanecem válidos.

## Cobertura funcional

| Área | Exportações cobertas |
| --- | --- |
| Produção e PCP | Relatório geral e por OP, sete setores, furos, apontamentos, controle de peças, mapa, prioridades, programação, corte, montagem, solda, bancadas, GRD, pintura e faltantes |
| Comercial | OP, itens, produção da obra, desenhos, saúde financeira e suas abas, lotes, modelos de materiais e acessórios |
| Compras e almoxarifado | Mapa de cotação, resumo de faturamento direto, CMR, indicadores mensais, materiais e separação |
| Financeiro e Diretoria | Contas a pagar/receber/pagas, faturamento, fluxo de caixa, conferência de títulos, fluxo da produção e desenhos |
| Planejamento | Datas de setor, cargas e atividades do cronograma |
| Engenharia e cliente | LPC/LE geradas, lista publicada, lista do modelo IFC e padronização de tabelas externas elegíveis |
| Expedição e terceiros | Listas, confronto/relatório de expedição e geração FORM 22/26 com histórico |
| RH | Folha de pagamento, ponto e quatro modelos de importação |
| Assistente | Arquivos tabulares gerados pelo assistente do portal |

## Inconsistências corrigidas

- Abas adicionais sem a identidade aplicada à primeira aba.
- Modelos estreitos com mesclas sobrepostas; impressão com colunas vazias.
- Descrições cortadas por altura fixa e avisos entre tabelas presos à primeira coluna.
- Datas e percentuais explicitamente textuais em relatórios passam a valores
  nativos; identificadores e valores dos modelos de importação permanecem intactos.
- Filtro compartilhado substituía o filtro específico e escolhia a última tabela
  em relatórios com vários blocos. Totais ficam fora da faixa de filtragem.
- Listas literais de validação perdiam nomes com vírgulas e excediam 255 caracteres.
  Agora usam intervalos nomeados de uma aba técnica oculta.
- Modelos comerciais tinham células editáveis vazias sem destaque visual e rótulos estreitos.
- O importador de levantamento de estrutura confundia a instrução com o
  cabeçalho e criava um material fictício a partir dos títulos. Agora exige
  rótulos de tabela em colunas distintas, validado no ciclo exportar/reimportar.
- O conversor externo podia descartar abas e limitar a 20 colunas. Agora conserva
  todas as abas e até 100 colunas/5.000 linhas por aba, ou recusa a transformação
  integralmente; fórmulas, macros, desenhos, vínculos, comentários e estruturas
  não reconhecidas não são achatados.
- Falha no conversor não permite enviar o arquivo original quando a exibição de
  peso não foi autorizada pelo portal do cliente.
- A planilha de desenhos da Diretoria não é baixada parcialmente quando a API
  sinaliza o limite de 20.000 itens; solicita uma seleção menor de OPs.
- FORM 22 impede mais de 497 marcas de sobrescreverem a área de assinaturas.
- Colunas auxiliares externas ao FORM 22 ficam ocultas; mantê-las visíveis
  reduzia o formulário a cerca de um quarto da largura útil na impressão.
- FORM 22 deixa de carregar data fixa e CNPJ de transportador de exemplo do
  template. A data acompanha a emissão e CNPJ ausente fica vazio. Marcadores
  internos de filtro ficam ocultos e o rótulo do total passa a ser legível.
- Fluxo de caixa recusa período inválido/invertido antes de consultar dados.

## Contratos preservados e exceções

- Cálculos de folha, encargos, pintura, orçamento e produção usam as mesmas regras.
- Modelos de importação mantêm primeira linha, nomes de abas, coordenadas,
  códigos com zeros iniciais, exemplos, fórmulas e validações. Não se insere capa.
- FORM 22/26 mantém o formulário oficial e seus campos; o histórico recebe o padrão.
- Arquivos originais já arquivados ou anexados (inclusive XLSM) não são regravados
  em massa. Fontes complexas não reconhecidas seguem originais somente quando
  as permissões autorizam; sem autorização de peso, a versão é bloqueada para revisão.
- `lib/sharepoint-rh.js` sincroniza uma planilha-fonte existente; não é exportação visual.
- `app/engenharia/listas/ListasClient.jsx` acrescenta a revisão ao arquivo original
  que será armazenado; `app/api/producao/pecas/importar-le/route.js` produz um
  intermediário de leitura. Ambos conservam o contrato do arquivo de entrada.
- `lib/romaneio-terceiro-excel.js` é legado sem chamadores. A emissão ativa usa
  `lib/romaneio-terceiro-form22.js` e o FORM 26, pelo gerador compartilhado FORM 22.

## Verificação

Testes de serialização/reabertura verificam tipos, códigos, fórmulas, validações,
proteção, totais, filtros, múltiplas abas, modelos RH, preservação do caderno de
pintura e autorização do cliente. Banco, permissões e integrações são simulados.

Download verificado no navegador local, usando o retrato existente da OP 097:
sete abas; 1.826 linhas em Preparação, 422 por aba de Montagem até Pintura,
545 em Expedição; sem erros de JavaScript e sem requisições de gravação.

Aparência conferida com importação/renderização no Artifact Tool e impressão
no LibreOffice. O segundo leitor foi necessário para confirmar logo e zeros
iniciais que o renderizador de prévia não reproduziu corretamente. Arquivos de
QA usam dados fictícios; não são registros oficiais nem anexos enviados a clientes.

Esta auditoria verifica a estrutura das exportações e amostras dos geradores.
Não é uma conciliação de todos os registros de todas as OPs com sistemas externos.

## Inventário dos pontos que usam a base compartilhada

- `app/api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio/route.js`
- `app/api/comercial/template-acessorios/route.js`
- `app/api/comercial/template-materiais/route.js`
- `app/api/expedicao/terceiros/[id]/material/route.js`
- `app/api/expedicao/terceiros/[id]/romaneio/route.js`
- `app/api/expedicao/terceiros/route.js`
- `app/api/financeiro/fluxo/exportar/route.js`
- `app/api/portal/[token]/lista/route.js`
- `app/api/rh/cargos/template/route.js`
- `app/api/rh/documentos/template/route.js`
- `app/api/rh/folha/[id]/export/route.js`
- `app/api/rh/funcionarios/template/route.js`
- `app/api/rh/ponto/[id]/export/route.js`
- `app/api/rh/setores/template/route.js`
- `app/comercial/[id]/AbaExpedicao.jsx`
- `app/comercial/[id]/AbaProducao.jsx`
- `app/comercial/[id]/DesenhosOPSection.jsx`
- `app/comercial/[id]/OPDetailClient.jsx`
- `app/comercial/[id]/ResumoLotes.jsx`
- `app/comercial/[id]/SaudeFinanceiraOP.jsx`
- `app/compras/painel-ops/[opId]/BotaoResumoFD.jsx`
- `app/compras/recebimento-cmr/CmrLancarClient.jsx`
- `app/compras/rm/[id]/BotaoMapaCotacao.jsx`
- `app/diretoria/DiretoriaClient.jsx`
- `app/diretoria/FluxoProducao.jsx`
- `app/expedicao/listas/ListasExpedicaoClient.jsx`
- `app/expedicao/relatorio/RelatorioExpedicaoClient.jsx`
- `app/financeiro/contas-pagar/ContasPagarClient.jsx`
- `app/financeiro/contas-pagas/ContasPagasClient.jsx`
- `app/financeiro/contas-receber/ContasReceberClient.jsx`
- `app/financeiro/faturamento/FaturamentoClient.jsx`
- `app/indicadores/compras/mensal/MensalClient.jsx`
- `app/pcp/dashboard-prioridades/DespachoPanel.jsx`
- `app/pcp/grd/GrdClient.jsx`
- `app/pcp/producao/ProducaoClient.jsx`
- `app/pcp/relatorio-corte/RelatorioCorteClient.jsx`
- `app/pcp/relatorio-corte/ResumoProducao.jsx`
- `app/planejamento/datas-setor/LiberarFrentes.jsx`
- `app/planejamento/programacao-cargas/ProgramacaoCargasPlanejamentoClient.jsx`
- `app/planejamento/tarefas/AtividadesCronograma.jsx`
- `app/portal/[token]/ModeloObraCliente.jsx`
- `app/producao/PainelProducaoClient.jsx`
- `app/producao/controle-op/ControleOPClient.jsx`
- `app/producao/controle/ControleClient.jsx`
- `app/producao/mapa/MapaProducaoClient.jsx`
- `app/producao/modelo/ModeloClient.jsx`
- `app/producao/pecas/PecasClient.jsx`
- `app/producao/prioridades/PrioridadesProducaoClient.jsx`
- `app/producao/programacao/SetorClient.jsx`
- `app/producao/programacao/SetorPlaceholder.jsx`
- `app/producao/programacao/corte/ProgramacaoCorteClient.jsx`
- `app/producao/programacao/montagem/MontagemClient.jsx`
- `app/producao/programacao/montagem/PainelBancadas.jsx`
- `components/BotaoRelatorioDia.jsx`
- `components/MateriaisOPSection.jsx`
- `components/SeparacaoModal.jsx`
- `lib/assistente/gerar-planilha.js`
- `lib/excel-padronizar.js`
- `lib/excel-relatorio.js`
- `lib/excel-tabular.js`
- `lib/export-faltantes-setor.js`
- `lib/export-lista-expedicao.js`
- `lib/folha-solda.js`
- `lib/listas-eng-formatada.js`
- `lib/mapa-cotacao-excel.js`
- `lib/pintura-excel-cliente.js`
- `lib/relatorio-producao-excel.js`
- `lib/relatorio-producao-op-excel.js`
- `lib/resumo-fd-excel.js`
- `lib/romaneio-form22.js`
- `lib/romaneio-terceiro-form22.js`

## Segunda revisão visual — pacote v2

- O cabeçalho dos relatórios gerados mantém três linhas e passa a separar marca,
  título em largura integral e identificação do documento. Código, revisão,
  data/hora e referência de formulário continuam presentes, sem deslocar a tabela.
- Corpo padrão em 10 pontos e bordas verticais discretas; tamanhos explícitos
  das instruções de trabalho e cabeçalhos compactos são respeitados.
- Relatórios com largura total superior a 210 unidades de coluna usam A3 em
  paisagem quando estavam no A4 padrão. Formulários oficiais e modelos de
  importação preservam sua configuração. Configurações explícitas de repetição
  de cabeçalho permanecem; tabelas simples passam a repetir também a identificação.
- Colunas do relatório por OP passam a ter larguras próprias para texto,
  quantidade, peso, percentual e data, preservando as sete abas e seus valores.
- 48 testes locais passaram (modelos de importação, fórmulas, proteção, tipos,
  filtros, relatórios de produção e cabeçalho). Comparação dos 76 exemplos com
  o pacote anterior não encontrou alterações nos valores/fórmulas fora das
  três linhas do cabeçalho; nos modelos de importação a comparação foi integral.
- Pacote de revisão v2: 23 exemplos executados pelos geradores e 53 amostras
  estruturais, identificados no índice. As amostras não validam todos os cenários
  dos exportadores. Nenhuma publicação foi feita nesta revisão.

## Validação para publicação — 08/09/2026

- Pacote integrado sobre a versão atual de produção, sem incluir prévias locais.
- 63 testes passaram em oito arquivos, incluindo seis regressões adicionais de fontes externas.
- Download verificado no Chrome pelo servidor local: Excel reaberto com código 00097, percentual, data, peso, logo e configuração de impressão preservados.
- A conversão externa passa a detectar linhas/colunas ocultas. Fontes XLSX com proteção, validações ou formatos numéricos específicos são mantidas no original quando autorizado; se exigida remoção de peso, permanecem bloqueadas para revisão. Não se altera o arquivo arquivado.
- Revisão de código concluída sem bloqueadores restantes.
