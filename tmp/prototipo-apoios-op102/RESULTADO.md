# OP-102 — teste de apoios por contato (não publicado)

Protótipo preservado aqui; os arquivos de produção foram restaurados à versão publicada.
86 testes unitários passaram, mas a aceitação com os dados reais falhou: romaneio 1 ainda requer 3 veículos, romaneio 2 requer 2 + T102B34 especial.
Não houve escrita no banco nem publicação.

Causa: o mapa 2D mantém a altura máxima da caixa envolvente em toda a área; estruturas irregulares com vazios e apoios em cotas diferentes não são encaixadas. O protótipo extrai faces horizontais reais e desenha travessas/calços com contatos verificados, mas conserva a limitação da caixa e não reduz viagens. Não repetir simplesmente o relaxamento dos limites: é necessário tratar ocupação real/apoios em alturas diferentes e conferir os recursos reais de apoio usados pela fábrica.

Pergunta pendente ao usuário: usam apenas caibros e calços de madeira ou também berços/cavaletes?

Dados reais em /tmp/carga102. Scripts tmp/provar-ordens102.js, tmp/diagnostico-contactos.js, tmp/analisar102.js. Provas de 4 ordens de montagem por romaneio nos arquivos prova-N-ordem.json.
A simulação completa com faces ficou lenta demais (interrompida); otimização e teste de desempenho são necessários antes de integrar.
