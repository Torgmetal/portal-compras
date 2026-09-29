---
name: torg-relatorio-assinatura-fila
description: "Relatório de inspeção assina em FILA desde 29/09/2026: inspetor → Torg Metal → cliente, pelo PAPEL do convite; só quem tem a vez recebe; o cliente não vê antes da vez dele; envio antigo segue em paralelo"
metadata:
  type: project
---

Geraldo (29/09/2026): *"precisa colocar uma lógica para aprovação de relatório: primeiro inspetor, depois
torg e por último o cliente — exemplo: o Davi recebeu o relatório ao mesmo tempo que eu (…) ele abriu e
falou: está sem a assinatura de vocês"*. O Davi (TMSA) já tinha devolvido o RIP-089-002 e 003 por "Falta
assinatura". O envio convidava todos os assinantes de uma vez.

**Como ficou** (`lib/assinatura-fila.js`):
- ⚠⚠ **A ordem sai do PAPEL do convite, não da linha digitada.** `ordemNaFila` usa `COLUNA_DO_CONVITE`,
  a mesma regra das colunas do PDF ([[torg_relatorio_quadros_assinatura]]). Papel livre vai com a Torg,
  e o cliente é sempre o último. As posições vão de 100 em 100, mais uma sequência, então cada assinante
  tem ordem ÚNICA: dois na mesma ordem assinariam juntos e a vez pularia um deles.
- O envio (`/api/qualidade/inspecoes/[id]/assinatura`) cria todos com `ordem` e convida **só quem está com
  a vez** (`daVez`), com o PDF. Reenviar chama de novo quem está com a vez, nunca quem vem depois.
  `convidadoEm` só é gravado se o e-mail saiu.
- A passagem de vez é a infraestrutura dos planos (PLP/PIT), em `/api/assinar/[token]`. Ela recusa quem
  assina fora da vez (409 "Ainda não é a sua vez") e convida o próximo no ato. No relatório, o e-mail da
  vez diz "Assinatura — Relatório de Inspeção" e avisa que o documento já traz as assinaturas de antes;
  antes dizia "Aceite — documento".
- ⚠⚠ **O espaço do cliente (`/api/cliente/meu-espaco`) esconde o relatório de inspeção antes da vez dele.**
  Lá ele aparecia "aguardando a vez" COM o PDF aberto, ou seja, o mesmo documento ainda sem a Torg. A vez
  é medida pela FILA (`aguardaAVez`: alguém antes não assinou), não pelo `convidadoEm`, porque um e-mail
  que falhou não pode esconder o documento de quem já pode assinar. Plano (PLP/PIT) continua aparecendo
  como "aguardando a vez".
- A tela de envio explica a ordem, e o aviso depois do envio diz quem recebeu e quem ficou na fila. Lista
  e detalhe mostram "Com a vez: X (e-mail do convite) · na fila: Y" (`linhaFaltamAssinar`). As duas rotas
  precisam pedir `ordem` ao banco; sem o campo, a tela cai calada no "Falta assinar" antigo.

⚠ **Envio antigo (ordem nula) segue em PARALELO até acabar**, inclusive no reenvio. Os RIP-089-002 e 003,
reenviados em 29/09 às 14h42, são paralelos; entram na fila na próxima revisão, porque abrir revisão zera
o envio.
⚠ Cópias (quem não assina) continuam recebendo o documento no ENVIO, sem assinatura nenhuma — ninguém
pediu para mudar isso.
⚠ O e-mail da vez NÃO leva o PDF anexo. Gerar o PDF dentro do clique de "assinar" arriscaria estourar o
tempo da rota; o link mostra o documento já com as assinaturas.
