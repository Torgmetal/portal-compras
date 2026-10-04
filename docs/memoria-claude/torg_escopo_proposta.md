---
name: torg-escopo-proposta
description: Skill de proposta (04/10/2026) — matriz de escopo + padrões Torg/linhas vermelhas + conformidade por proposta; decisões do Vitor; esboço da revisão no portal; novo modelo visual (BV, sumário clicável, PIT da Vale, links dos projetos)
metadata:
  type: project
---

Vitor (05/09/2026): **"quando voltarmos a falar do comercial me lembre a respeito do escopo da
proposta"**. Retomado em 04/10/2026 e virou o desenho da **skill de proposta**.

## O pedido (04/10/2026)
"Nosso maior ponto de atenção é definir o que cada proposta deve conter de escopo (…) vincular as coisas
(…) não termos pontas soltas (…) normas, pontos de contrato diferentes do que enxergamos como adequado:
você precisa intervir e criar regras". LQC, cálculo e proposta têm de estar amarrados.

## O desenho aprovado
1. **Matriz de escopo Torg** — lista mestra (projeto, matéria-prima, fabricação, pintura/galvanização,
   parafusos, itens comerciais, frete, montagem, equipamentos, ART, data book, ensaios, inspeção…), cada
   linha incluso/excluso/opcional/cliente. LQC e proposta leem dela: custo sem escopo, ou escopo sem
   custo, é ponta solta.
2. **Padrões Torg** (normas e posições da casa) + **linhas vermelhas**.
3. **Matriz de conformidade** por proposta: cada exigência do cliente = atende no padrão / atende com
   custo (tem de estar na LQC) / desvio (alternativa) / esclarecimento (perguntar antes de cotar).
   Desvios vão para a seção "Desvios e premissas".
Fase 1 numa skill (claude.ai, skill-creator); fase 2 no portal.

## Decisões do Vitor
- A LQC da planilha do servidor vai ficar obsoleta: só **salvar a LQC na pasta do orçamento**.
- O diferente do padrão vira custo ou desvio, **mas o Comercial sempre tenta antes convencer o cliente
  a mudar** para o padrão Torg.
- Item sem custo próprio pode ser "diluído no BDI".
- **Linha vermelha: o orçamentista aprova depois de consultar a diretoria.**
- O pedido/contrato é conferido contra a matriz antes do Kick Off, e o Kick Off herda o escopo e os
  desvios aceitos.
- Pasta padrão por orçamento: 1.Emails … 7.Confidencialidade (já existe no servidor).
- Soldagem **AWS D1.1:2025**. Perfis: **manter as designações ASTM** por enquanto.
- ZIP: o orçamentista deixa a pasta descompactada; quando vier zipado, **posso descompactar na própria
  pasta do orçamento** (escrita no SharePoint só para isso).
- DWG: proposta de converter com LibreDWG (DWG→DXF) e ler os textos — **aguardando o ok para instalar**.

## Rascunho entregue (04/10)
"Padrões de Proposta Torg - rascunho R00.xlsx", com 6 abas:
- Leia-me;
- Matriz de escopo (61 itens em 9 grupos);
- Padrões Torg;
- Linhas vermelhas (10, a confirmar);
- Conformidade (modelo);
- Regras de conferência (13).

Pontas soltas reais achadas nas propostas enviadas:
- Athie: numeração 322 × 332 × 331; FD apagado mas citado nos pagamentos;
- TMSA 328: "Montagem" nos inclusos × 100% industrialização; "serviços de projeto" × detalhamento excluso;
- MSE 322: US fora dos exclusos;
- modelo sem montagem com "linha de vida provisória";
- AWS D1.1 ed. 2010.

Aguardando as correções dele.

## Revisão pelo portal (fase 2) — esboço no ar
Canvas https://claude.ai/artifact/2ftjWnwkQvwf79YwzjYZPy, com três telas:
- Escopo e conformidade;
- Revisão:
  - conferência vermelho/verde;
  - gaveta de correção com opções recomendadas;
  - a opção D "Outra correção", que é texto livre → antes/depois → confirmar; caso repetido vira opção
    nova com aprovação da diretoria;
- Nova revisão de documentos:
  - substituído / novo / retirado;
  - exigências a aceitar;
  - custo a refazer na LQC;
  - tabela de revisões automática;
  - a R00 enviada fica congelada.

## Novo modelo visual da proposta (04/10, em andamento)
Pedido: "adicionar o logo da Bureau Veritas conforme padrão informado pelo manual, e dar uma paginada
próxima do que estamos usando (…) data book e memorial de cálculo (…) número de páginas, índice com
hiperlinks para levar até os pontos exatos (…) os PITs devem ser iguais aos modelos (…) se precisar traga
o Codex". E: "colocar os links dos projetos na proposta para podermos consultar sempre que necessário e
abrir uma página para conseguir visualizar".
- Prévia feita pelo **Codex** (mesmo fluxo do data book), com o conteúdo da PTC-328-26 R00 e as duas
  pontas soltas corrigidas. O portal implementa depois da aprovação.
- Selo BV só na capa — ver [[torg_marca_bv]]. Anexo I = PIT no layout da Vale — ver [[torg_pit_layout_vale]].
- Anexo II: projetos com link para uma página do portal (login), ainda a criar. ⚠ Na 328 os 67
  projetos são **DWG**: a página de visualização depende da conversão DWG (o mesmo LibreDWG pendente).
- ⚠ Link no PDF que vai para o cliente cai no login do portal. Abrir para o cliente (página por token,
  só com os arquivos daquela revisão) esbarra no termo de confidencialidade da pasta 7: é decisão dele.

**How to apply:** não refazer as perguntas já respondidas. Próximos passos: aprovar o modelo visual →
as correções do rascunho R00 → a skill no skill-creator, testada refazendo uma proposta real.
