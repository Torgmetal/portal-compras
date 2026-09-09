# LQC aprovada — plano de implementação e publicação

Objetivo: integrar as prévias aprovadas aos dados reais e publicar a versão validada na Vercel. Referência visual e funcional: app/api/auth/previa-lqc-itens, especialmente REQUISITOS-IMPLANTACAO.md. Rotas de prévia e dados fictícios nunca entram no commit de produção.

Arquitetura: preservar EstudoFabricacao.composicao e seu autosave; atualizar componentes reais e o motor compartilhado. Reutilizar ProdutoTinta para boletins, com revisão e fabricante explícitos. Gerar snapshot separado e validado por destinatário antes de envio e na visualização por token.

## Tarefa 1 — Pintura e Quantitativo
- Responsável: implementador pintura. Arquivos: Pintura.jsx, CartaoLinha.jsx, Resumos.jsx, novos componentes auxiliares e lib/lqc.js.
- Portar visual aprovado sem fixtures. Entrada c, res, setComp, estudoId já usados no portal.
- Criar tipos personalizados no estudo, persistidos em composicao, com identificadores estáveis. Destino de demão deriva dos tipos ativos do Quantitativo, nunca de apenas 45/85.
- Suportar qualquer número de demãos, perda individual, área por destino/cor, nomes completos de área e estrutura, produtos sem mão de obra nesta aba.
- Preservar resultados legados quando os novos campos não existirem; a mão de obra permanece no motor existente e em seu contexto apropriado.
- Testes: compatibilidade dos estudos legados, quatro demãos, perdas distintas, destino removido, seleção por tipo/área, não duplicar peso/consumo.

## Tarefa 2 — Boletins e cotação real
- Responsável: implementador boletins. Arquivos próprios de catálogo/backend, schema/migração se indispensável, lib/cotacao-tinta-email.js e consulta-tinta token.
- Cadastro acessível pelo Comercial: fabricante, produto, PDF, revisão/data, dados técnicos conferidos, histórico preservado. Reutilizar ProdutoTinta.
- Fornecedor e fabricante têm vínculo explícito persistido; não inferir nomes, não misturar documentos WEG/Jotun.
- GET cotação deve disponibilizar dados reais e indicações por fornecedor; POST valida novamente no servidor e congela snapshot por destinatário. Só demãos/fornecedores selecionados; sem custos internos em conteúdo externo.
- Sem boletim compatível, solicitar produto ao fabricante com requisitos da demão. Cadastro existente não autoriza assumir equivalência técnica.
- Testes: isolamento de fabricante, revisão, sem cadastro, correspondência parcial, corpo adulterado, snapshot/token não vazam outro fornecedor.
- Interface com controlador: informar shape do GET/POST e a rota de cadastro assim que definido. Controlador implementa wizard visual.

## Tarefa 3 — Itens comerciais
- Responsável: implementador comerciais. Componentes e helper próprios; controlador altera EstudoClient e integra helper ao motor após tarefa 1.
- Nova aba após Material. Nove famílias, modelos com quantidade/unidade/custo diretamente e complementos conforme prévia. Sem consulta automática ao histórico Omie. Persistir em composicao; preservar itens antigos e totais.
- Margem extra não duplicada: custos destinados ao BDI. Frete uma vez por família, lã de rocha por m², cor em telhas.
- Testes: soma direta, múltiplos modelos, complementos, frete único, compatibilidade e persistência.

## Tarefa 4 — Integração, QA, revisão e deploy
- Controlador: EstudoClient, wizard visual real (CotacaoTinta.jsx; coordenar import com tarefa 1), ligações entre helpers e motor.
- Executar suites relevantes com serviços mockados, validar rotas reais no navegador sem escrever produção ou enviar emails de teste.
- Build isolado com env fictício. Revisão independente da mudança final, corrigir achados relevantes.
- Reconciliar com origin/main, versionar apenas arquivos reais, publicar via main/Vercel e verificar deploy Ready e alias oficial/hash.

## Progresso
- Plano iniciado sobre origin/main 2ff928af. Publicação explicitamente autorizada pelo usuário.

- Integração concluída: três tarefas reais, EstudoClient, wizard, BDI comercial, modelos na montagem e memória detalhada na exportação.
- Revisão independente: corrigidos custo fechado histórico, duplicata de boletim, token de upload dedicado, preço comercial com BDI no Resumo e decimais brasileiros na exportação.
- Validação: 95 testes relevantes passando; regressões das últimas correções 3/3; lint undef e diff check limpos.
- Build isolado sem credenciais reais: Next produção concluído, Prisma gerado em cliente isolado. Fonte conferida byte a byte com build.
- QA Chrome: componentes reais com APIs simuladas, quatro demãos persistidas, perdas distintas, abas, wizard e catálogo desktop/mobile sem erros e sem overflow. Nenhum e-mail real ou escrita de teste em produção.
- Exportação mantém fórmulas do modelo legado e adiciona abas explícitas RESUMO DO PORTAL, COMERCIAIS DETALHADOS e DEMAOS DETALHADAS para composições livres.
