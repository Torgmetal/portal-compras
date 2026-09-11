# Divisão do Gantt por quantidade

> Implementação com superpowers:subagent-driven-development, revisão independente e validação local antes da publicação já autorizada.

**Objetivo:** distribuir unidades de uma mesma marca por dias e bancadas, conservar quantidade/peso/produção e reler exatamente a programação salva.

**Desenho aprovado:** o usuário escolheu corrigir a divisão de quantidades (item 1). A OP-115 tem T115A1 (44 unidades, custo 8,8) e T115A2 (6 unidades, custo 0,6). Dez dias devem permitir dividir as unidades; dois dias continuam indicando sobrecarga real. Não alterar os cadastros da OP-067 nem da OP-112.

**Contrato:** cada item do Gantt mantém `id` da peça e acrescenta `inicioUnidade` (inteiro, zero-based). `q` é o tamanho da faixa. As faixas são identidade de planejamento, não novas peças nem apontamentos. Ao salvar, blocos mantêm `ids` e acrescentam `fracoes: [{id, inicio, quantidade}]`. Frações de um mesmo id em dias diferentes não são deduplicadas por marca. Movimentos sucessivos sobre a mesma unidade usam o último destino. Retornos/previsões de terceiro permanecem indivisíveis e usam o protocolo existente.

**Persistência:** tabela adicional por peça e setor registra faixas e âncora dos campos antigos (dia/recurso/quantidade). Os campos antigos continuam indicando que a peça está programada. A leitura expande as faixas antes de calcular peso, custo e feito. Mudança da âncora por outra tela invalida a distribuição antiga, evitando ressuscitar programação. Salvamento antigo inteiro substitui a distribuição. Apagar limpa a distribuição do setor. Migração apenas aditiva, sem modificar programações reais nos testes.

## Tarefas

- [x] Backend: testes de salvar/reler faixas, remanejo parcial, duplicação/limites, transação, leitura de produção parcial e lista do posto. Implementar schema/migração, protocolo opcional, guardas, auditoria e expansão dos lotes.
- [x] Frontend: teste vermelho OP-115 com 10 dias; dividir por unidades e reagrupar faixas contíguas por célula. Peso/custo/feito proporcionais, produção concluída sem duplicação; salvar e desfazer preservando outras faixas da marca. Manter seleção por marca dentro da barra e retornos indivisíveis.
- [x] Integração: verificar exclusão e exportações da programação fracionada para não apagar/exportar a quantidade inteira quando a ação diz respeito a uma fração.
- [ ] Validar em localhost com dados de teste isolados, executar regressões relevantes e revisão independente. Aplicar somente migração aditiva, fazer build/publicar e confirmar domínio.

## Critérios de aceitação

- `44 / 10` distribui unidades entre dez dias com soma 44, sem duplicar IDs de peças no banco.
- OP-115 (44 + 6) cabe em dez dias de uma bancada livre na régua normal; dois dias mostram sobrecarga verdadeira.
- Salvar e recarregar não concentram de novo as 44 unidades num dia.
- Arrastar/desfazer uma fração não muda as demais frações da mesma marca.
- Apontamento cumulativo dá baixa nas faixas em ordem cronológica, no máximo uma vez por unidade.
- A lista do posto por dia/semana conserva as quantidades distribuídas.
- Mantidas as guardas de LPC ativa, croquis e terceiros; dados reais não são alterados para testar.

## Decisões

- Usar intervalos de unidades em vez de duplicar PecaConjunto ou inventar progresso físico.
- Regra de calendário, capacidade e produtividade existente permanece; corrigir a distribuição não reduz a estimativa de trabalho.
- Branch `codex/gantt-divisao-quantidades`; não há outros arquivos rastreados em edição ao iniciar.

## Validação realizada

- 120 testes em 19 arquivos passaram (backend, interface, exportações, sábados e guardas).
- Revisão independente das correções sem bloqueadores restantes.
- Servidor de dev: página e API reais responderam 200, somente leitura. Prévia isolada da OP-115 distribuiu 50 unidades em dez dias, entre 90% e 100%, e salvou/releu o plano em memória com zero gravações de programação em produção.
- Migração aditiva aplicada, sem reprogramar peças reais.
- Exclusão permanece por marca inteira no setor, explicitada no botão e confirmação. Exportações exigem salvar alterações pendentes.
- Limitação de compatibilidade: alterações externas nos campos antigos invalidam a distribuição quando mudam dia, recurso ou quantidade; uma regravação externa com os mesmos valores não é distinguível.
