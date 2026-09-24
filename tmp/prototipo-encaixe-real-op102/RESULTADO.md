# Encaixe real OP-102 — protótipo não integrado

Usuário confirmou: caibros, sarrafos e pallets. Embalagens especiais excepcionais, especialmente evitar no Econômico. Não voltar a perguntar isso.

Novo módulo ocupacao-real recorta todos os triângulos IFC numa grade 50mm, conservando min/max vertical e liberando vazios laterais. Testes unitários de faces finas e inclinação passaram. Encaixe-piso usa máscara não retangular, quatro orientações, duas camadas de caixas compatíveis. Testes de encaixe L + caixa passaram. Testes completos do último protótipo ampliado NÃO rodados; não publicar.

Resultados reais conservadores: romaneio1 2 veículos (antes3), romaneio2 2 veículos normais + peça especial T102B34 (antes2+especial). Ainda não atende a expectativa de 2 no total. Nenhuma alteração em dados ou publicação. Arquivos de produção restaurados para evitar ativação parcial.

Dados/resultados /tmp/carga102/piso*.json. Scripts tmp/prova-piso102.js, buscar-piso102.js.

Problema residual: peças em L/irregulares não têm contatos nos quatro quadrantes de suas caixas. Exigir duas linhas com contatos à esquerda/direita do centro da caixa rejeita empilhamentos potencialmente viáveis. Relaxar isso sem uma validação física só repetiria apoios falsos. A nova tentativa de encaixe vertical usa ocupação real para reduzir a cota Y, mas o planejador de apoios continua limitado.

Volume/centro de massa do IFC foi investigado por soma de tetraedros, massas 4-6% acima da lista (B12=132 vs127kg; B50=320 vs307; B6=384 vs370; B55=304 vs289). Isso NÃO foi implementado/validado como solução nem deve ser tratado como aprovação de transporte.

Antes de integrar: corrigir colisões da própria madeira, atualização da máscara após empilhamento, apoios/carga transmitida, limite de desempenho, edição manual/rotação, PDF/madeira, teste real e visual local. Não trocar por algoritmo permissivo só para anunciar 2 viagens.
