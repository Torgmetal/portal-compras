---
name: torg-etapa-conjunto-croqui
description: "Portal Compras Torg — quem é apontado no corte é o CROQUI, não o conjunto: 'onde está a peça' tem que herdar a preparação dos croquis, e a leitura mora numa função só (etapaDasMarcas)"
metadata:
  type: project
---

**No Syneco, quem é apontado no corte é o CROQUI — o conjunto não tem apontamento próprio até ser
montado.** Medido em 05/09/2026 na OP-112: 67 marcas cortadas (850 peças), **todas croquis e
avulsas**; zero conjuntos. Como o modelo 3D e as telas de "onde está a peça" mostram **conjuntos**,
ler só o apontamento próprio faz a obra parecer parada — e foi isso que o portal do cliente e o
modelo interno mostraram para o Vitor ("me parece ter muito mais peças preparadas do que essas que
você mostrou no filtro"). Era verdade.

**A regra:** conjunto sem apontamento próprio herda a etapa dos croquis dele, e a herança **nunca
passa de "Preparação"** (croqui é cortado e vira parte do conjunto; não vai além). Apontamento
PRÓPRIO do conjunto sempre manda — montado, soldado ou pintado, a etapa é a dele.

**Onde isso mora:** `etapaDasMarcas(opId, marcas)` em `lib/portal-obra-consulta.js`. **Toda tela que
responde "onde está a peça" chama essa função** — portal do cliente (`/api/portal/[token]/niveis`) e
modelo interno (`/api/producao/modelo-3d`). A rota interna tinha a própria cópia da leitura, e a
cópia não sabia o que a outra aprendeu: **duas leituras da mesma pergunta é como a tela passa a
mentir sem ninguém mexer nela.** Se aparecer uma terceira tela com essa pergunta, ela chama a
função — não copia a consulta.

⚠ "Corte" e "Preparação" são a MESMA etapa para quem olha de fora (o Syneco separa as operações 10 e
20) — unificar já na contagem, senão a lista mostra duas linhas com o mesmo nome.

⚠ Lição de método (mesmo dia, duas vezes): **conferir a API e dar por conferido não vale.** Eu
afirmei "está funcionando" com base no dado do servidor enquanto a tela descartava a resposta
(`achou` dos níveis derrubava setores e tipos). Dado certo no servidor não prova nada sobre o que
chega na tela.

Ver [[torg_peca_setor_real]], [[torg_syneco_apontamento_fonte]], [[torg_marca_conjunto_croqui]].
