---
paths:
  - "lib/painel-prazos-rm.js"
  - "app/compras/prazos/**"
  - "app/api/compras/prazos-rm/**"
  - "lib/sincronismo-prazos.js"
  - "lib/cobranca-atraso*.js"
  - "lib/resposta-fornecedor.js"
  - "lib/prazo-proposto.js"
  - "lib/frete-cotacao.js"
  - "app/fornecedores/entrega/**"
  - "app/api/fornecedores/entrega/**"
  - "app/fornecedores/c/**"
  - "app/api/cron/omie-encerrados/**"
  - "app/api/compras/entregas/prazo/**"
  - "scripts/ensure-entrega-declarada.mjs"
---

## Prazos das RMs (Compras) — o que aperta, e o que exige coleta

`Compras › Prazos das RMs` agrupa os pedidos do Omie POR RM. A conta mora em
`lib/painel-prazos-rm.js`; o desenho, em `app/compras/prazos/`.

**Precedência da situação de um pedido**:
`CHEGOU (inclui encerrado no Omie) > PARCIAL > prazo (ATRASADO / VENCE_HOJE / PROXIMO / NO_PRAZO / SEM_PRAZO)`.

⚠⚠ **PEDIDO ENCERRADO NO OMIE NÃO É PEDIDO ATRASADO — e a ETAPA não serve para saber.** `cEtapa`
vale "15" tanto em pendente quanto em encerrado, e `ConsultarPedCompra` não expõe bandeira nenhuma.
Quem separa é o FILTRO da pesquisa: `PesquisarPedCompra{lExibirPedidosEncerrados:"T"}`. Cron próprio
(`/api/cron/omie-encerrados`, 7h20) grava `PedidoOmie.encerradoOmieEm`. **Encerrar não é receber**:
nada ali escreve `statusEntrega`/`dataEntregaReal` nem baixa item. Ver [[torg_omie_recebimento]].

⚠⚠ **AUSÊNCIA NÃO É REABERTURA.** Desmarcar só acontece com EVIDÊNCIA POSITIVA (o pedido aparecer
na pesquisa de pendentes); coleta incompleta ou resposta sem forma de retrato **só marca, nunca
desmarca**. Uma resposta `{}` do Omie chegou a valer "coletei tudo e não há nenhum encerrado".

⚠⚠ **ENCERRADO NO OMIE CONTA COMO "CHEGOU" — não existe situação separada.** Matheus (17/09/2026):
*"agrupe encerrados junto com chegou, porque se está encerrado chegou"*. Nasceu como chip próprio
("Encerrado no Omie"), por eu achar que encerrar é ato administrativo e não prova recebimento; na
operação da Torg o comprador só encerra depois que o material entrou, e o chip separado dividia em
dois uma coisa que é uma só. ⚠ A PROCEDÊNCIA fica: a linha escreve "chegou · encerrado no Omie",
porque quem confere precisa saber se o carimbo veio da nota fiscal ou do comprador. ⚠ E **não se
inventa atraso** a partir da data do encerramento — ela diz quando o portal VIU o pedido fechado,
não quando o material chegou.

⚠⚠ **PARCIAL VENCE O PRAZO, e isso foi medido.** Dos 275 pedidos CRIADO, 19 são `PARCIAL` e os 19
têm previsão vencida — deixando o prazo ganhar, todos diriam só "Atrasado" e a parcialidade não
apareceria. O atraso continua à vista na frase ("parte já chegou · N dias de atraso no restante").

⚠⚠ **O FILTRO DE FORNECEDOR AGRUPA PELA RAIZ DO CNPJ (8 dígitos), não pelo nome nem pelo CNPJ
inteiro.** Pelo nome, 57 opções com duplicatas ("AÇOS MAQ" × "AÇOS MAQ CONCHAL LTDA"); pelo CNPJ
completo, a SOUFER apareceria 4× com rótulo idêntico (matriz + 3 filiais). A raiz identifica a
EMPRESA por lei — é exato, não heurístico. 57 → 42 opções. O rótulo do grupo é o **nome mais usado**
(senão "INDUSCOLOR TINTAS", com 28 pedidos, se chamaria "VENDAS", que alguém digitou uma vez).

⚠ **Filtrar por fornecedor REFAZ a linha da RM** (total, situação, próxima data) e **reordena** —
tirando o pedido atrasado de um fornecedor, a RM pode virar "No prazo" e não pode seguir no topo.

### O botão "Sincronizar" — sem esperar o cron
`POST /api/compras/prazos-rm/sincronizar` (regra em `lib/sincronismo-prazos.js`). Matheus
(17/09/2026): *"para quando eu receber alguns pedidos e quiser sincronizar eu conseguir sem
precisar esperar o cron"* — os crons rodam 7h20 e 8/11/14/17h; quem dá entrada numa NF às 11h05
esperaria três horas.

⚠⚠ **SÃO DUAS VARREDURAS, PORQUE RECEBER MEXE EM DUAS COISAS NO OMIE**: dar entrada na nota
(`sync-entregas` → `statusEntrega`) e encerrar o pedido (`omie-encerrados` → `encerradoOmieEm`).
Uma etapa só corrigiria metade do que a pessoa acabou de fazer. **Cada uma relata a sua** — Omie
fora do ar na primeira não impede a segunda: meia sincronização informada é melhor que nenhuma
sincronização explicada. Estados: `concluida | parcial | ocupada | falhou`.

⚠⚠ **OS TRÊS DISPARADORES DA VARREDURA DE ENTREGAS COMPARTILHAM A TRAVA** (`comTravaDeCron`, chave
`sync-entregas`): este botão, o do Cronograma e o cron. Sem isso o botão seria exatamente o cenário
que a trava existe para evitar — a pessoa clica quando desconfia do automático, ou seja, perto do
horário dele. Ver [[torg_trava_entre_execucoes]].

⚠⚠ **A TRAVA IMPEDE SIMULTANEIDADE, NÃO REPETIÇÃO** (achado do Codex): daí o **intervalo mínimo de
2 min** (`reservarVez` sem soltar, chave `sync-manual`), contado do **FIM** da rodada — reservado no
início, a rodada de 111 s deixava 10 s de espera. E se as duas etapas estiverem ocupadas, a vez é
**devolvida**: nenhuma chamada ao Omie foi gasta.

⚠⚠ **O "DEADLINE" ERA CONSELHO ATÉ 17/09/2026.** `omieCall` tem timeout de 45 s por tentativa e até
5 tentativas: uma chamada iniciada com 1 s de orçamento ainda podia levar minutos, que é como a
Vercel mata a rota e o navegador recebe HTML no lugar de JSON. Agora `omieCall` aceita **`ateMs`
absoluto**, encolhe o `AbortSignal` para o tempo restante e recusa dormir para retentar além dele.
`syncEntregas`, `coletarEncerrados` e o backfill repassam. ⚠ Nada muda para quem não passa `ateMs`.

⚠ **Orçamento medido contra a produção**: rodada inteira ~110 s. Entregas 90 s (com 70 s fechava só
46 de 54), encerrados até 150 s no total (274 pedidos em ~40 s), `maxDuration` 180 s.

⚠ **O caminho manual não varre NFs** (`pularNF`) e só olha pedido sem entrega (`apenasPendentes`) —
o `Recebimento` com a NF associada continua saindo do cron diário.

### Cobrar os atrasados — um e-mail por fornecedor
`POST /api/compras/prazos-rm/cobrar` (regra em `lib/cobranca-atraso*.js`; a tela em
`ModalCobrarAtrasados.jsx`). Matheus (17/09/2026): *"um botão para disparar e-mails para os
pedidos/RMs que já estão com 1 dia em atraso, mas eu devo conseguir escolher qual fornecedor (…)
preciso desse e-mail separado, um para cada fornecedor com sua respectiva RM/Pedido e suas datas"*.

⚠⚠ **UM E-MAIL POR FORNECEDOR, COM A LISTA DENTRO — nunca um por pedido.** Medido em 18/09/2026:
8 fornecedores atrasados, 25 pedidos, e a SOUFER sozinha tem **12**. Um e-mail por pedido encheria
a caixa dela com doze mensagens quase idênticas, e a primeira coisa que alguém faz com doze e-mails
iguais é parar de ler os doze.

⚠⚠ **O AGRUPAMENTO POR RAIZ DE CNPJ SERVE PARA FILTRAR UMA TELA; PARA MANDAR E-MAIL, PRECISA DE
GUARDA** (achados do Codex). Agrupar é afirmar "é a mesma empresa" — e o e-mail de um fornecedor
não pode conter pedido de outro. O grupo é **bloqueado**, nunca "resolvido no chute", quando:
- os pedidos apontam para **e-mails diferentes** (`varios-destinos`);
- **algum** pedido está **sem e-mail** (`email-parcial`) — ignorá-lo fazia o pedido órfão, com o
  token público dele, sair no e-mail do contato do vizinho;
- o documento **não é um CNPJ plausível** (`sem-cnpj`) — `chaveFornecedor` também produz
  `doc:<dígitos>` para documento curto ou fictício, e dois cadastros com "0" no campo entrariam
  juntos.

⚠ Hoje nenhum dos 8 é bloqueado: a SOUFER abrange matriz e filial (dois CNPJs) com **um contato
só**, e é por isso que o corte é por DESTINO divergente, não por CNPJ divergente.

⚠⚠ **O PARCIAL VENCIDO É COBRADO, ao contrário do chip "Atrasado" da tela.** Lá ele tem chip
próprio e sai de "Atrasado"; aqui o que falta dele é exatamente o que precisa ser cobrado — o
pedido 1594 da SOUFER está parcial e 42 dias vencido. Por isso o número do modal é MAIOR que o do
chip, e a tela escreve *"inclui os recebidos parcialmente"*.

⚠ **`dataEntregaReal` sozinha não é chegada** — ela é anotação humana e existe em 222 dos pedidos
vivos. Quem carimba é o `statusEntrega` junto dela; os únicos vencidos com essa data e sem status
terminal são 2, ambos PARCIAL.

### E-mail não tem desfazer — o que isso obriga
⚠⚠ **A TENTATIVA É GRAVADA ANTES DO ENVIO, e falhar aí IMPEDE o envio.** Gravando só depois, um
erro na auditoria apagaria a prova de que o e-mail saiu — e o intervalo de 2 dias, que lê dali,
mandaria tudo de novo. Transação de banco não desfaz e-mail; a ordem é a única proteção.

⚠⚠ **EXCEÇÃO NO ENVIO É `indeterminado`, NUNCA "falhou".** Timeout depois de o provedor aceitar é
indistinguível de recusa — e reenviar "por garantia" é como a mesma cobrança chega duas vezes.
`sendEmail` marca `indeterminado: true` só no caminho de exceção; a tela **desmarca** o
indeterminado, exigindo nova seleção consciente para reenviar.

⚠ **Intervalo mínimo de 2 dias por fornecedor**, lido do AuditLog **dentro** da reserva
(`reservarVez("cobranca:<chave>")`) — lido antes da fila, duas requisições veriam as duas "nunca
cobrado". **Falhar a leitura não vale "nunca foi cobrado"**: sem leitura, não envia.

⚠ **Um fornecedor não derruba a rodada**: cada um volta com o seu estado
(`aceito | falhou | indeterminado | bloqueado | recente | ocupado | desconhecido`) num **200**. Um
500 faria a tela oferecer "tentar de novo" para a lista inteira, inclusive para quem já recebeu.

⚠ **O corpo da requisição escolhe QUAIS chaves, e mais nada** — nunca destinatário, pedido, data
ou token. Chave fora da lista de atrasados é recusa, não busca nova.

⚠ **Sem `sendEmailBatch`**: ele descarta `cc` e `replyTo`, então a cobrança sairia sem as cópias
internas, em silêncio. Laço sequencial com pausa de 600 ms (Resend aceita ~2 req/s).

⚠ **O token nunca entra na auditoria** — é credencial de acesso público, e log não é lugar de
guardar credencial. E ele é criado com `where: { tokenEntrega: null }`: ler nulo e gravar sem
condição deixava duas execuções sobrescreverem o token uma da outra, e o link que já saiu num
e-mail anterior passava a dar 404 na cara do fornecedor.

### O texto da cobrança (aprovado por Matheus, 17/09/2026)
⚠⚠ **PERGUNTA DUAS DATAS**: a nova data de entrega E quando o material estará **pronto para
carregamento**. "Entrego dia 25" e "está pronto dia 22" levam a programações diferentes no pátio.
Como ninguém tem CIF/FOB respondido ainda (0 de 25), "pronto para carregamento" funciona nos dois
casos; quando o campo encher, dá para afiar a pergunta por fornecedor.

⚠⚠ **A COLUNA "SITUAÇÃO" EXISTE POR CAUSA DOS PARCIAIS.** Sem ela o e-mail lista o pedido inteiro
como pendente e o fornecedor responde "já mandamos" — com razão.

⚠ **Pede a nota fiscal de volta**: é a saída mais barata para a lista encolher sozinha.
⚠ **Não acusa.** "Já passaram da data combinada" é fato; "precisamos de uma posição urgente" fecha
a porta com quem a Torg vai precisar na semana que vem.
⚠ **Cópia para `matheus@` e `compras@`** (env `COBRANCA_ATRASO_CC`), **respostas para `compras@`**
(caixa da área, não some quando alguém sai de férias). A tela mostra os dois ANTES do clique.

⚠⚠ **A ESCRITA PÚBLICA TEM TETO, e ele é diferente do teto de aviso** (achado do Codex,
18/09/2026). As travas de aviso limitavam o **e-mail**, não o banco: alternar data e motivo abria
transação, gravava auditoria e gerava proposta nova sem limite — e ainda fazia a tela de Compras
colher 409 atrás de 409. `podeEscrever` corta em **10 por hora e 30 por dia** por pedido, com
**429**. ⚠ Tetos folgados de propósito: é anti-abuso, não controle de fluxo. ⚠⚠ E este **falha
ABERTO**, ao contrário de `podeAvisar` — não conseguir ler o limite ali atrasa um aviso; aqui
impediria o fornecedor de responder, que é o propósito inteiro do link.

### O fornecedor responde — e agora alguém fica sabendo
`/fornecedores/entrega/<token>` é **público, sem login** — o link vai no e-mail de cobrança, um por
linha da tabela. `PATCH` aceita UMA de duas respostas: nova **previsão** ou **"já foi entregue"**
com o número da NF (`lib/resposta-fornecedor.js`, `scripts/ensure-entrega-declarada.mjs`).

⚠⚠ **O LINK EXISTIA DESDE MAIO, FOI USADO 6 VEZES E NADA REAGIA.** Medido em 18/09/2026: última
resposta em 10/06, e duas delas nem eram prazo — eram recado ("Material foi entregue na NF
000362322"). Para um recurso cujo propósito é *obter uma resposta*, o elo que faltava era avisar
alguém. Agora toca o **sino do módulo COMPRAS** e sai **e-mail** (`RESPOSTA_FORNECEDOR_CC`).

⚠⚠ **DECLARAR ENTREGA NÃO É ENTREGAR.** Nada ali escreve `dataEntregaReal`, `statusEntrega` nem
`nfNumero` — esses vêm da NF de entrada REAL, pelo cron `sync-entregas`. A declaração mora em
colunas próprias (`fornecedorEntregaEm`, `fornecedorNfNumero`), a tela escreve *"fornecedor informou
entrega na NF X · aguardando conferência"* em âmbar, e **o pedido continua cobrável e na mesma
situação** até alguém conferir. Um terceiro sem login mudando a crença do portal sobre o que chegou
faria o pedido sumir do vermelho e da lista de cobrança sem ninguém da Torg ter olhado nada.

⚠⚠ **A ROTA É PÚBLICA: AVISAR A CADA CHAMADA É UMA TORNEIRA DE E-MAIL** apontada para `compras@`
(achado do Codex). Três travas: **repetição idêntica é sucesso SEM evento** (mesma NF, mesma data →
não avisa, não grava), **intervalo de 15 min** entre avisos do mesmo pedido, e **teto de 5 por 24h**.
⚠ Falhar a leitura do limite NÃO libera o aviso — o pior caso de não avisar é um atraso; o de
avisar sem limite é inundar quem precisa ler.

⚠⚠ **O HISTÓRICO INTERNO VAZAVA PELO LINK.** `PrazoHistorico` guarda tanto o recado do fornecedor
(prefixo `[Fornecedor]`) quanto o comentário interno de quem altera prazo por dentro
(`/api/compras/entregas/prazo`), **sem prefixo**. O GET público devolvia todos. Medido: 15 das 17
linhas são internas, e uma já tinha texto. Agora só o texto `[Fornecedor]` sai; as datas de todas as
alterações continuam à vista, porque o fornecedor precisa conferir o que combinou.

⚠ **Os recebimentos são escopados ao pedido** (`where: { pedidoOmieId }`). Um RMItem pode ser
atendido por mais de um pedido, e somar todos mostraria ao fornecedor quantidade que outro entregou.
Medido: 0 casos hoje — é defeito estrutural, não incidente.

⚠ **A condição de estado vai no próprio UPDATE** (`where: { id, dataEntregaReal: null }`), não só na
leitura: entre ler e gravar, alguém pode ter confirmado o recebimento por dentro.

⚠ **A NF é texto**: zero à esquerda importa, e "consertar" a entrada apagaria dígito de quem digitou
certo. Só `trim`, teto de 40 e recusa de caractere de controle. ⚠ Número de NF **não prova nada** —
é pista para quem vai conferir.

⚠ **`Cache-Control: no-store` e `Referrer-Policy: no-referrer`** nas respostas: o token viaja por
e-mail e não pode ficar em cache intermediário nem vazar no `Referer` de um clique para fora.

⚠ **O aviso nunca derruba a resposta.** Ela já está gravada; dizer ao fornecedor que deu errado o
faria tentar de novo, e cada tentativa é outro aviso.

### A data do fornecedor é PROPOSTA — quem efetiva é Compras
`POST /api/compras/prazos-rm/prazo-proposto` (regra em `lib/prazo-proposto.js`, tela em
`app/compras/prazos/PropostaDePrazo.jsx`). Matheus (18/09/2026): *"sim, o Compras precisa aprovar
a alteração depois"*.

⚠⚠ **ATÉ AQUI O LINK PÚBLICO REMARCAVA O PRAZO SOZINHO.** Quem abrisse o token digitava uma data e
o `prazoEntregaPrevisto` mudava na hora: o pedido saía do vermelho, saía da lista de cobrança e a
RM inteira podia virar "No prazo" — por ação de um terceiro sem login. A rota pública agora grava
só `prazoProposto*`; **nada nela escreve `prazoEntregaPrevisto` nem cria `PrazoHistorico`**. Mesma
lição de `fornecedorEntregaEm`: resposta de terceiro é INSUMO, não fato.

⚠⚠ **PROPOSTA PENDENTE NÃO SUSPENDE A COBRANÇA** (achado do Codex). Suspendesse, responder
qualquer data — inclusive uma impossível — seria o jeito mais barato de sumir da cobrança, e o
silêncio de Compras viraria aprovação tácita. `propostaPendente` fica FORA de `situacaoDoPedido`.

⚠⚠ **`prazoPropostoId` É A VERSÃO DA PROPOSTA, e existe porque comparar a data não basta** (achado
do Codex): mesma data com outro motivo, e o vaivém A→B→A, passariam por "é a mesma proposta que eu
estava vendo". A tela devolve o id que leu; divergiu, é **409**. E a troca é condicionada no
próprio UPDATE (`where: { id, prazoPropostoId }`), não só na leitura.

⚠⚠ **`prazoOriginal` VEM DA PREVISÃO EFETIVA (`previsaoAtual`), NÃO DA COLUNA CRUA** (achado do
Codex). Há pedido cuja previsão vem dos itens da cotação ou do prazo escrito em palavras, com
`prazoEntregaPrevisto` nulo — gravando a coluna, o original nasceria nulo e a cobrança perderia a
referência do que foi combinado.

⚠⚠ **SÃO DOIS EFETIVADORES, E O OUTRO É `app/api/compras/entregas/prazo/route.js`** (achado do
Codex). Ele lia antes da transação; agora lê dentro dela, e **remarcar por dentro MATA a proposta
pendente** — deixada viva, o botão "aprovar" continuaria na tela e um clique depois desfaria a
decisão interna com a data (mais antiga) do fornecedor, sem ninguém perceber. O descarte fica no
`AuditLog`.

⚠⚠ **RECUSAR AVISA O FORNECEDOR POR E-MAIL** (achado do Codex). Recusa silenciosa é pior que não
ter o fluxo: ele viu "recebido" na tela e segue achando que a data está combinada — a Torg programa
o pátio para uma data e ele carrega para outra. ⚠ O aviso nunca derruba a recusa (já gravada), mas
a tela diz em **vermelho** quando o e-mail falhou ou o fornecedor não tem endereço: quem recusou
precisa saber que ninguém foi avisado.

⚠ **O histórico guarda o prefixo `[Fornecedor]` e o que ELE escreveu** — nunca o comentário de quem
aprovou. É por esse prefixo que o GET público decide o que devolver, e um texto interno colado ali
vazaria pelo link. Quem aprovou fica em `alteradoPorId`.

⚠ **A página do fornecedor diz "em análise"** e "enviada", nunca "registrada com sucesso" — senão
ele programa o carregamento para uma data que a Torg ainda não aceitou. E sem o bloco de análise
ele voltava ao link, via o prazo antigo intacto e reenviava (cada reenvio é outro aviso).

⚠⚠ **PRAZO SE FORMATA EM UTC, NÃO EM SÃO PAULO** (18/09/2026). A data vem de um
`<input type="date">`: "2026-11-20" é meia-noite UTC, e meia-noite UTC em São Paulo ainda é o
**dia 19**. O e-mail de aviso e a página do fornecedor mostravam um dia ANTES do que ele digitou,
enquanto a tela de Compras (que já formatava em UTC) mostrava o certo. ⚠ Isso vale para PRAZO; o
carimbo de *quando* algo aconteceu continua em `America/Sao_Paulo`.

### De quem é a data que está valendo
⚠⚠ **O CARTÃO MOSTRAVA SÓ A DATA NOVA**, indistinguível da original. Quem olha a tela precisa
diferenciar *"esta data veio do fornecedor ontem, depois de cobrarmos"* de *"esta data sempre foi
essa"* — senão o fornecedor empurra o prazo, o pedido sai do vermelho e ninguém percebe que nada de
fato melhorou. `origemDaPrevisao` (`lib/painel-prazos-rm.js`) lê o último `PrazoHistorico`; a linha
escreve *"previsão informada pelo fornecedor em dd/mm — “motivo”"*.

⚠ **Vale só a ÚLTIMA alteração**: uma edição interna depois dele devolve a autoria a quem editou.
Manter o crédito do fornecedor ali seria mentir sobre de quem é a data que vale.

### CIF ou FOB — quem paga o frete, e quem vai buscar
O fornecedor responde no portal de cotação (campo **obrigatório**, ao lado do prazo de entrega), e
a resposta aparece nos Prazos das RMs. `lib/frete-cotacao.js`, coluna `Cotacao.tipoFrete`.

⚠⚠ **A PERGUNTA É OPERACIONAL, NÃO CONTÁBIL: "preciso mandar buscar?"** Por isso a etiqueta leva a
AÇÃO junto da sigla — "FOB · Coletar", "CIF · Entrega do fornecedor". A sigla sozinha obriga quem lê
a lembrar a convenção.

⚠ **Obrigatório nos DOIS lados.** A tela bloqueia o engano; o servidor bloqueia o resto (aba velha,
reenvio, POST fora do formulário). Sem a trava no servidor, o campo seria obrigatório só para quem
não tivesse motivo de burlá-lo.

⚠ **O frete da RM só existe quando TODOS os pedidos concordam.** Carimbar "FOB" numa RM em que só um
dos três é FOB mandaria buscar o que já vem sozinho — mesma regra da tag FD.

⚠ **Cotação antiga fica sem frete (`null`), não com um chute.** Chutar CIF faria a tela dizer que o
material vem sozinho e ninguém programaria a coleta.
