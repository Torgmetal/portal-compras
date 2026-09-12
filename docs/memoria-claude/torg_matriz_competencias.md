---
name: torg_matriz_competencias
description: RH › Matriz de Competências (FORM-11 / ISO 9001 §7.2) — competências e qualificações por cargo
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f538acb-c17d-4894-a954-1bd896767adf
  modified: 2026-08-09T18:43:40.522Z
---

Módulo **Matriz de Competências** em `/rh/competencias` (RH). Commit inicial 120d880 (04/08/2026). Acesso ADMIN/RH. É o **FORM-11** da ISO 9001 §7.2 (competência): descrição da função + competências com nível esperado (escala 1–5) + requisitos admissionais + qualificações por forma de evidência + matriz funcionário×competência com %.

- **Antes era um stub** ("Em construção"). Aba no [[SidebarRH]] renomeada de "Competências" → "Matriz de competências".
- **Construído sobre modelos que JÁ existiam** (estavam sem UI/API): `Competencia` (nome @unique, descricao, categoria — vocabulário global compartilhado entre cargos), `CargoCompetencia` (cargoId+competenciaId, `nivelEsperado` 1–5), `FuncionarioCompetencia` (funcionarioId+competenciaId, `nivelAtual`, avaliadoEm/Por).
- **Cargo ganhou** `descricao`, `area`, `matriz` (JSONB) — colunas via `ensure-mes-tables.mjs` (idempotente; db push travado por drift). `matriz` = { revisao, revisadaEm, status, escolaridadeObrigatoria/Desejavel, experienciaAdmissao/Promocao, qualificacoes:[{grupo TECNICA|QUALIDADE|DESEMPENHO, item, evidencia}], emitidoPor, aprovadoPor }.
- **DECISÃO do Vitor (taxonomia): POR CARGO** (todos os 79, não por papel-base). Cada Júnior/Pleno/Sênior tem a própria matriz; a senioridade é expressa no **nível esperado** de cada competência. Visual aprovado = o do protótipo (cabeçalho FORM-11 navy+laranja, barras de nível, matriz de qualificação).
- **API**: GET `/api/rh/competencias` (lista + resumo), GET/PATCH `/api/rh/competencias/[cargoId]` (PATCH faz upsert de Competencia por nome, sincroniza CargoCompetencia e grava avaliações de FuncionarioCompetencia).
- **Telas**: lista por área com status (matriz / só descrição / vazio) + busca; detalhe = documento FORM-11 completo, descrição editável inline.

### A planilha-fonte (MATRIZ DE COMPETÊNCIAS ... R0 - a validar.xls)
48 abas (1 por função) + MODELO. **Só 1 foi migrada pro formato novo completo** (AUXILIAR DE DEPARTAMENTO PESSOAL: 15 competências c/ nível + requisitos + qualificações). As outras 47 são formato antigo (só descrição de função + área). Vários **typos** nos nomes (ANALISTRA, ADMINITRATIVO, FINANCIERO, SOLDAODR). 4 inativas.

### Cruzamento planilha × cargos do portal
Taxonomias diferentes: portal = **79 cargos** em carreira (Jr/Pl/Sr/Especialista = 33 papéis-base); planilha = 48 papéis chatos. Só 2 batem por nome exato. Seed usou **mapa curado papel-base→aba** (`_seed_matriz.mjs`, rodado 1x direto no PROD, não versionado). Resultado semeado: **descrição+área nos 79** (63 da planilha, 16 autorais p/ Diretor, Vendedor, Jardineiro, Op. Ponte Rolante, Aux. Produção/Expedição, Coordenador, Líder de Setor) + **matriz completa do Auxiliar de RH**.

### Feito depois do commit inicial
- **Edição da matriz pela UI** (99bc121): botão "Editar matriz" no detalhe → modo edição de competências (add/remover/nível 1-5), requisitos, qualificações por grupo, controle de revisão + descrição/área. Funciona pros 78 cargos que só têm descrição (é como o RH monta cada matriz). Barra sticky de salvar (usa `left-64` p/ limpar o SidebarRH).
- **Avaliação dos funcionários** (7dbf88d): clicar no nome na matriz de qualificação abre `AvaliarModal` — picker 1-5 do nível atual por competência, % ao vivo, destaque "abaixo"; salva via PATCH `avaliacoes` → upsert FuncionarioCompetencia (chave `funcionarioId_competenciaId`). Clicar de novo no nível desmarca.
- **Ajustes 06/08 (feedback do Vitor)** (4883197): escolaridade **"Desejável" SAIU** da matriz — só fica "Obrigatório" (o dado `escolaridadeDesejavel` fica preservado no JSON, só não é exibido/editado). Promoção agora tem 2 critérios: **"Promoção (por tempo)"** (`experienciaPromocao`, como estava) + novo **"Alto desempenho"** (`matriz.promocaoAltoDesempenho`) que antecipa a promoção antes do período. Cargo **Acabador (Jr/Pl/Sr)**: escolaridade obrigatória setada p/ **"Ensino fundamental incompleto"** (atende a função — decisão do Vitor) + alto desempenho semeado. Tipos de treinamento (`/rh/treinamentos`) ganharam SST→"SST - Segurança do Trabalho", Mudança de Processo, Não Conformidade, Ação Corretiva, Auditorias, Meio Ambiente (client TIPOS + enum da API + rótulos/cores no IndicadoresRHClient).

### Matrizes autoradas (04/08) — TODOS os 79 cargos têm matriz
Autorei (draft, derivado das descrições) a matriz completa dos 78 cargos que só tinham descrição — competências + níveis + requisitos + qualificações. **Todos marcados `matriz.status="A VALIDAR"`** (badge laranja) p/ o RH validar; só o Auxiliar de RH veio da planilha (validado). Seed rodado 1x direto no PROD (`_seed_todas.mjs`/`_seed_acabador.mjs`, não versionados; biblioteca de competências compartilhada + escalonamento por senioridade: **Júnior = ref−1, Pleno = ref, Sênior/Especialista = ref+1**, floor 1 / cap 5). 153 competências no vocabulário global (`Competencia`). Ex.: Soldador Jr 2,7 → Pl 3,7 → Sr 4,7. Decisão do Vitor: "faça de todos que não tem".

### Conformidade documental por funcionário (09/08, 920aa4c)
A matriz mostrava o exigido, mas não o que cada funcionário atende. Agora as qualificações da
seção 4 (`matriz.qualificacoes`) que são **documento/certificado** (selo C — NR-12, NR-06, NR-35…)
são cruzadas por funcionário: `nrDoArquivo(item)`→`NR_PARA_TIPO`→tipo CCT, `checarRegraDocumento`
sobre RH+prontuário (`mesclarDocs`, ver [[torg_prontuario_certificados]]). GET `[cargoId]` devolve
`qualificacoesDoc` + `conformidade{itens,emDia,total,percentual}` por funcionário. Tela do cargo
ganhou painel **"Conformidade documental dos funcionários"** (só leitura, após a seção 4): tabela
funcionário × qualificação-documento (em dia/vencendo/vencido/não consta) + % + média do cargo.
51 dos 79 cargos têm qualificação-documento. As qualificações AS/AA/LP (supervisor/avaliação/lista)
NÃO são documento — seguem na avaliação da seção 5. `maxDuration=60` (varredura do prontuário).

### Pendente (próximas etapas)
- **PDF do FORM-11** (pdf-lib, padrão RH tipo holerite/ponto) — ainda não feito.
- RH validar/ajustar as 78 matrizes "A VALIDAR" (é rascunho meu) e lançar as avaliações dos funcionários.

Ver [[torg_qualidade]] (SGQ) e convenções de RH.
