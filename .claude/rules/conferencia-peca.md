---
paths:
  - "lib/conferencia-peca*.js"
  - "lib/conferencia-email.js"
  - "lib/conferencia-relatorio.js"
  - "app/expedicao/conferencia/**"
  - "app/api/expedicao/conferencia/**"
---

## Conferência de peça (Expedição)

`Expedição › Conferência de Peça` → Iniciar conferência, escolher a OP, e lançar **MARCA,
QUANTIDADE, OBSERVAÇÃO**. Feita no **celular no pátio**, antes de a peça ir para pintura e
etiquetagem.

| | |
|---|---|
| Regra | `lib/conferencia-peca.js` — a validação mora aqui, não na rota |
| Fonte da L.E. | `lib/itens-expedicao.js` (a mesma das etiquetas) |
| Tabelas | `ConferenciaPeca` + `ConferenciaPecaItem`, criadas por `scripts/ensure-mes-tables.mjs` |
| Quem acessa | `EXPEDICAO` + `ADMIN` — Matheus (09/09/2026): "todos que tiver acesso ao módulo Expedição pode fazer conferência" |

⚠⚠ **O teto é da OBRA, não da sessão.** Se a L.E. tem 2 peças de uma marca e a conferência de
ontem pegou as 2, a de hoje não aceita mais nenhuma. Sessão **CANCELADA** não conta — é o desfazer
de quem abriu por engano; se contasse, um clique errado consumiria o saldo da obra para sempre.

⚠ **As duas recusas são problemas diferentes e a mensagem diz qual**: "não está na Lista de
Expedição" é a peça errada na mão (uma posição, que vai soldada dentro do conjunto); "você já
conferiu 2" é a peça certa contada duas vezes.

⚠⚠ **Uma sessão ABERTA por obra, garantido no banco, não só na rota.** Duas pessoas em dois
celulares somariam no mesmo teto sem se enxergar, e a segunda descobriria isso na forma de um "já
conferiu tudo" que ela não entende. Quem chega depois entra na sessão que já existe. Um índice
único PARCIAL (`ON "ConferenciaPeca"("opId") WHERE status = 'ABERTA'`) trava isso no Postgres —
mora só em `scripts/ensure-mes-tables.mjs`, porque o Prisma não tem sintaxe pra índice parcial no
`schema.prisma` (documentado no comentário do model). Achado do Codex (09/09/2026): sem essa trava,
duas aberturas simultâneas criavam duas sessões pra mesma OP.

⚠⚠ **POST, PUT, DELETE e o "finalizar/cancelar" disputam o MESMO saldo — e travam por OP, não só
validam.** Achado do Codex (09/09/2026, simulado com dependências mockadas): dois lançamentos de
"+1" simultâneos numa marca com saldo 1 passavam os DOIS. `comTravaDaObra` (`lib/conferencia-peca.js`)
pega um `pg_advisory_xact_lock(hashtext(opId))` numa transação interativa do Prisma antes de ler o
saldo — quem chega depois espera na fila do Postgres e lê o saldo já atualizado, não um retrato
velho. O status da sessão também é **relido por dentro da trava**, não só checado antes: sem isso,
uma gravação podia passar por cima de uma sessão que acabou de ser finalizada por outra chamada.

⚠⚠ **O lançamento carrega uma chave de idempotência (`chaveOperacao`), pra reenvio não duplicar.**
Achado do Codex (09/09/2026): a rota grava e SÓ DEPOIS relê o estado pra devolver à tela; se essa
releitura falhar, o operador vê erro com a peça já contada, e tocar "Lançar" de novo criava um
segundo lançamento. O front (`app/expedicao/conferencia/[id]/chave-operacao.js`) gera uma chave por
TENTATIVA, num `useRef`, e só troca depois de um sucesso — reenviar com o formulário ainda
preenchido manda a MESMA chave, e a rota devolve o que já foi gravado em vez de gravar de novo. Um
`@@unique([conferenciaId, chaveOperacao])` é o backstop se duas cópias da mesma chave baterem quase
juntas (múltiplos `NULL` não colidem, então lançamentos antigos não são afetados).

⚠ **O autocomplete ordena por exatidão**: marca exata, depois as que começam com o texto, depois as
que só o contêm. Digitar `T89A10` põe T89A10 em primeiro sem sumir com T89A100 — filtrar as outras
fora tiraria da tela justamente o que quem está no meio da digitação ia escolher.

⚠ **O autocomplete só sugere a partir de 2 letras.** A OP-97 tem 537 marcas: abrir a lista no
clique despeja algo que ninguém lê e empurra o formulário para fora da tela do celular.

⚠ **Escolher a marca NÃO preenche a quantidade** — ela fica sempre em 1. Preenchendo com o saldo, a
tela troca *contar* por *confirmar*: um toque daria por conferidas 10 peças que ninguém olhou, com
o número vindo da própria lista que a conferência existe para checar.

⚠⚠ **Ao corrigir um lançamento (PUT), o próprio lançamento sai da conta antes de validar**
(`validarEdicao`). Validando contra o saldo cru, `conferido` já inclui o item e QUALQUER correção
seria recusada — inclusive as que diminuem. O bug seria pior que a ausência da funcionalidade: a
tela deixaria consertar só o que não precisava.

⚠ **O Torguinho não aparece nesta tela.** Ele é `fixed bottom-4 right-4` e no celular fica em cima
do campo OBSERVAÇÃO, ao lado do botão de lançar (visto na validação em 390×844). Padding não
resolve — ele flutua sobre a viewport. Está na mesma lista de exceções de `/colaborador` e
`/meu-rh`, em `components/TorguinhoChat.jsx`.

### Ao FINALIZAR, a planilha vai sozinha para o PCP

Matheus (17/09/2026): *"quando o operador finalizar uma inspeção e clicar em Finalizar, o portal
automaticamente envie um relatório em Excel para pcp@torg.com.br — dessa forma ela vai usar essa
relação para realizar Romaneios"*. `lib/conferencia-email.js`, destino em `CONFERENCIA_PECA_EMAIL`
(padrão `pcp@torg.com.br`).

⚠⚠ **O ANEXO É O MESMO ARQUIVO DO BOTÃO "EXCEL" DA TELA**, do mesmo `montarRelatorio`. Um segundo
relatório "para o e-mail" seria duas versões da mesma conferência divergindo na primeira vez que
alguém mudasse uma coluna — e quem recebe por e-mail não teria como saber qual vale.

⚠⚠ **ENVIAR NUNCA DERRUBA O FINALIZAR.** O operador está no pátio, no celular, com o caminhão
esperando: Resend fora do ar não pode significar conferência que não encerra. O status é gravado
ANTES; o envio é tentado depois e o resultado **volta para a tela** — falhar em silêncio faria o
operador ir embora achando que o PCP recebeu.

⚠ **Só no finalizar.** Cancelada é o desfazer de quem abriu por engano; planilha dela daria ar de
documento ao que foi anulado de propósito (mesma regra da rota de relatório).

⚠⚠ **A COLUNA A É SÓ A MARCA — o PCP COPIA ela inteira** para montar romaneio. Colunas:
`Marca | Descrição | Previsto | Conferido | Saldo | Situação | Peso unit. | Peso conferido |
Observações`. `testes/lib/conferencia-excel-colunas.teste.js` lê o XLSX gerado de volta e trava
essa ORDEM: mudá-la quebra o trabalho de quem não tem como saber que mudou.

⚠⚠ **O PESO DA LINHA É O DO CONFERIDO, NÃO O DO PREVISTO.** A planilha vira romaneio, e romaneio
pesa o que sobe no caminhão; o previsto declararia carga que talvez não exista.

⚠ **As observações sobem para a linha da marca.** Estavam só no histórico, que é cronológico — quem
lê a linha da peça precisa ver ali o "chegou amassada", sem caçar no rodapé.

⚠ **A validação é no servidor.** A tela mostra o saldo e evita a maioria dos erros, mas lê um
retrato de alguns segundos atrás. Toda gravação responde com o estado inteiro recalculado — o
navegador nunca soma saldo sozinho.

⚠⚠ **Modo Pátio — tela cheia no celular, com saída que exige confirmação.** Matheus (08/09/2026):
"quando clicar em iniciar conferencia entrar em modo tela full no celular para não ter chance do
operador sair sem querer". `app/expedicao/conferencia/modo-patio.js` (hooks `usarEhCelular`,
`usarModoPatio`, `pedirTelaCheia`) + `[id]/ModoPatio.jsx` (a moldura). Só entra no celular
(`window.innerWidth < 768`, o mesmo corte do `md:` do Tailwind) — em tablet deitado/desktop a tela
normal, com a sidebar, continua. Sair pede confirmação numa folha ("Continuar" / "Sair"); a
conferência nunca é perdida, só a tela volta pra lista.

⚠ **Duas camadas de "tela cheia", porque só uma funciona no iPhone.** `pedirTelaCheia()` chama o
Fullscreen API de verdade (`requestFullscreen`), mas só funciona onde o navegador suporta —
Android, desktop — e só dentro de um gesto do usuário, por isso é chamada no CLIQUE de "Iniciar
conferência"/retomar sessão (`ConferenciaClient.jsx`), não na tela de destino (a navegação é
client-side, o estado sobrevive à troca de rota). **No iPhone — Safari, Chrome, qualquer
navegador — o Fullscreen API não existe**, é limitação do WebKit da Apple, não dá pra contornar em
JS. A moldura de CSS (`ModoPatio.jsx`, `position: fixed` + `100dvh`) cobre a tela de qualquer
jeito, sempre; quando o Fullscreen API não está disponível e a página não está em modo `standalone`
(instalada na Tela de Início), aparece uma dica única (guardada em `localStorage`) explicando o
único jeito real de tirar a barra do navegador no iPhone: Compartilhar → Adicionar à Tela de
Início. As páginas de conferência declaram `appleWebApp` no `metadata` (`page.js`, list e sessão)
pra isso funcionar quando adicionadas.
