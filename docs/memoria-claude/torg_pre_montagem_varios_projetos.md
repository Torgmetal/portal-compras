---
name: torg_pre_montagem_varios_projetos
description: Relatório de pré-montagem (RPM) aceita VÁRIOS projetos — a regra "um conjunto por relatório" do dimensional barrava o segundo projeto no servidor com mensagem de um escopo que a tela nem mostra; escolher na pasta SOMA na pré-montagem e TROCA nos outros tipos
metadata:
  type: project
---

**Geraldo/Vitor (21/09/2026), OP-105:** *"não estamos conseguindo mais salvar os projetos da OP-105
de pré-montagem no relatório"*.

**Causa.** Na pré-montagem não se escolhe peça, se escolhe PROJETO — e a tela deixa marcar vários
(`umaSo = ehDimensional && !ehPreMontagem && …`), o relatório guarda até 12 `desenhos`, e o
detalhe já tem o seletor por desenho. Mas a rota de criação (`/api/qualidade/inspecoes/dimensional`)
aplicava a regra do dimensional — `escopo === "CONJUNTO" && marcas.length > 1` → 400 *"Relatório de
conjunto é um por conjunto. Para agrupar, use o escopo de peças avulsas"* — e a pré-montagem nem
mostra o seletor de escopo (fica "CONJUNTO" por padrão). Dry-run com os dados reais da OP-105: 1
projeto passa, 2 tomam 400. Os 5 RPM existentes tinham exatamente 1 projeto cada: **nunca tinha sido
possível mais de um** desde 22/08 (`ehDimensional = usaCotas(tipo)` passou a incluir PRE_MONTAGEM).

**O que mudou**
- Criação: pré-montagem exige ≥1 **projeto** (não peça) e fica FORA da regra "um por conjunto".
- `POST /api/qualidade/inspecoes/[id]/projetos` ("escolher na pasta da obra"): na pré-montagem
  **soma** ao relatório (sem repetir, teto 12); nos outros tipos continua **trocando** — o
  dimensional é de um conjunto só e escolher outro é corrigir o desenho. O botão diz "adicionar
  projeto da pasta da obra" quando já há um.

⚠ **Antes de mexer numa regra por `tipo`, listar os tipos que ela alcança.** `usaCotas` juntou
DIMENSIONAL e PRE_MONTAGEM para não espalhar `tipo === …` por dez arquivos — e a regra de "um
conjunto" foi junto sem ninguém decidir. Ver [[torg_desenho_rotacao_pdf]] (a mesma tela, o desenho
cortado) e [[torg_qualidade]].
