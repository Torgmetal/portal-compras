# Memória compartilhada do Claude — Portal Torg

Um arquivo por fato, índice aqui. Vale para qualquer sessão, em qualquer máquina (Mac ou Windows), e para
qualquer pessoa do time. Ao aprender algo novo, grave um arquivo novo (ou atualize o existente), acrescente
a linha aqui e commite. Nada de segredo: senha, token e chave ficam no `.env.local`.


## Portal Compras — Torg Metal

### Time
- **Vitor Costa** — diretor, comercial/EPC, orçamentos, produção
- **Matheus** — dev, fez módulo admin (usuários), configurou Resend (torg.com.br)

### Rotina diaria
- **Ao iniciar novo dia**: revisar commits recentes (`git log --since="1 day ago" --all --format="%h %an %s"`); conferir conflitos, mudanças de schema, ajustes.

### Infra
- Resend com domínio torg.com.br (EMAIL_FROM na env; DNS feito pelo Matheus). Sem staging: dev local roda contra Neon de produção.
- [Deploy granular](torg_deploy_granular.md) — subir/validar CADA mudança em prod; não agrupar
- [Deploy Vercel — atraso do webhook](torg_vercel_deploy_atraso.md) — push às vezes leva 20+ min p/ buildar (esperar, sobe sozinho); NÃO forçar `vercel --prod`; CLI scope `torg`/`workspace-torg`
- [Deploy Vercel/Neon — branch limit](torg_vercel_neon_deploy.md) — "Provisioning integrations failed" = Neon estourou branches; desligar per-preview branch ou apagar previews (nunca a primária)
- [Deploy decisivo](torg_deploy_decisivo.md) — direção acordada = subir sem pedir permissão a cada passo
- [Neon — o que foi MEDIDO da infra](torg_neon_infra.md) — banco 229MB, mínimo pequeno × máximo enorme = OOM na largada; 2 mudanças de painel pendentes; NÃO temos API key do Neon
- [Trava entre execuções de cron](torg_trava_entre_execucoes.md) — ⚠ `pg_advisory_lock` NÃO tranca com pooler (provado); usar arrendamento em `CronHeartbeat.travadoAte`
- [Crons + middleware + monitor](torg_crons.md) — crons morriam por redirect .vercel.app→workspace (308) na edge; corrigido 02/07 (excluir /api/); Vercel MCP=40; 17/09 cmr-reconciliar 55h parado NÃO era redirect nem timeout — Neon intermitente mata o cron E o registro da falha (heartbeat congela em ok=true); mitigado 2×/dia3 use CLI; monitor heartbeat
- [MES — a barra de nesting tem dono](torg_mes_reserva_barra.md) — índice parcial único `(unidadeId, ambiente) WHERE liberadaEm IS NULL`; liberação centralizada no encerramento; transferir não move produção; ⚠ impede a barra ABERTA em dois postos, não a REABERTA
- [MES/Syneco](torg_mes_syneco.md) — agente na fábrica (C:\MesSync, 2 datasets: apontamentos + ordens); incidente 01/06; rotacionar MES_SYNC_API_KEY
- [iCloud apaga arquivos-fonte](torg_icloud_delecao.md) — repo no iCloud remove fontes e cria pastas " 2"; NUNCA `add -A`/`commit -a`; conferir `git status` antes

- [`npm run checar` antes de subir](torg_checar_imports.md) — `next build` NÃO pega função usada sem import; 3 quebras em 5 dias

### Segurança & libs
- [Segurança — decisões e pendências](torg_seguranca_pendencias.md) — limitador POR CONTA (nunca por IP); `audit fix --force` PROIBIDO (quebra exceljs); não regenerar token de fornecedor
- [Backups](torg_backup_banco.md) — banco: dump semanal no SharePoint (Workspace/Backup - Portal); código: GitHub; docs: Blob + SharePoint
- [Libs compartilhadas](torg_libs_compartilhadas.md) — data-br, html (escapeHtml), blob-url (anti-SSRF), token (gerarTokenForte), **numero-br** (`numeroBR`), `fmtOP` única; usar em código novo
- [Fuso: servidor roda em UTC](torg_fuso_servidor.md) — `toLocaleString("pt-BR")` não define fuso; usar `dataHoraBR()`/`dataBR()` no que o SERVIDOR escreve (não em `@db.Date`)
- [Upload trava em 4,5MB](torg_upload_4mb.md) — rota serverless trava ~4,5MB; "não anexa" costuma ser TAMANHO; fix = client-token (`*/upload-token` + `@vercel/blob/client`)
- [Integração de IA (Claude)](torg_ia_integracao.md) — portal usa @anthropic-ai/sdk, model `claude-sonnet-4-6`, ANTHROPIC_API_KEY; extração em lib/extrair-*.js
- [Omie recebimento/NF/pedido](torg_omie_recebimento.md) — etapa 15, tolerância de peso, chave nIdPedido, codigo_local_estoque por item
- [Pedido — rescale de preço](torg_pedido_rescale.md) — escala preço pro totalProposta só se cobre a proposta INTEIRA; split inflava; corrigido ffa4b13 (guard + ≤15%)
- [RH Documentos](torg_rh_documentos.md) — upload privado (client token >4MB), proxy de download, backup ISO no SharePoint
- [RH Holerite + bug NaN/Zod](torg_rh_holerite.md) — import/disparo/ciência (PDF); bug "Invalid input: NaN" (z.number() rejeita NaN; `NaN ?? null` não vira null)
- [RH Ponto — horas extras](torg_rh_ponto_he.md) — ACJEF só marcações; totais confiáveis no PDF do cartão (TORG/VMI); Vitor optou manual
- [Campanha em vídeo no mural](torg_campanha_mural.md) — MuralAviso+MuralCiencia, ciência obrigatória no login; 3 armadilhas (403 do FUNCIONARIO, /public sem sessão, falha do vídeo)
- [Funcionário × usuário do portal](torg_funcionario_x_usuario.md) — `Funcionario.usuario` só tem 8 de 70; cruzar por e-mail, e domínio NÃO separa interno de externo
- [Matriz de Competências](torg_matriz_competencias.md) — /rh/competencias (FORM-11/ISO §7.2); POR CARGO (79); falta edição UI, avaliação, PDF
- [Vagas/Recrutamento](torg_vagas_recrutamento.md) — /rh/vagas; e-mail aprovação (Solicitar aprovação→ADMIN, Avisar RH→módulo RH); "Gerar arte" canvas p/ Insta/Face/LinkedIn (fotos /public/obras, Feed+Story)
- [Organograma em PDF](torg_organograma_pdf.md) — RH › Organograma "Exportar PDF" em ÁRVORE A3 paisagem (Diretoria→ADM|Fábrica→setores; NÃO lista A4); regex RX_FABRICA
- [Prontuário = fonte de treinamentos](torg_prontuario_certificados.md) — certificados do SharePoint alimentam Treinamentos, Conformidade CCT e Atendimento (66%→90,7%); cobertura só quem tem prontuário; `documentosDeProntuarioSeguro`
- [Módulo Relatórios](torg_relatorios.md) — /relatorios (hub); v1 status c/ fotos (layout Data-book); RelatorioStatus (SQL); envio+aceite por token; lista REL-001
- [Preço de venda por kg (modelo + Galvani)](torg_preco_venda_kg.md) — custo por classe + aço 6,81 + parafusos + tinta ÷ (1−BDI−lucro−imposto do destino); Galvani BA 113,5 t 3 demãos chapa R$18 → R$ 27,62/kg
- [⏳ Estudo de fabricação + Cenário Financeiro](torg_estudo_fabricacao.md) — /comercial/orcamentos/estudos; custo da casa medido, cadência, NF-e como medidor; PENDENTE alinhar material com a planilha (24/08)
- [⏳ Escopo da proposta — lembrar](torg_escopo_proposta.md) — Vitor pediu para levantar isso sempre que o assunto voltar a ser Comercial
- [Orçamento de Serviço](torg_orcamento_servico.md) — aba na Central de Orçamentos (/comercial/orcamentos/servicos); OrcamentoServico (SQL); step 1 pronto, abas da proposta pendentes
- [Peso real da OP](torg_peso_real_op.md) — somar PecaConjunto cru dobra; usar `pesoRealPecas` de lib/peso-op.js (canônico=LE, senão LPC) em toda soma por OP
- [Marca = avulsa; entrega = conjunto + marca](torg_marca_conjunto_croqui.md) — croqui é componente: fica na GRD, NÃO no Data Book nem em contagem de "marcas da OP"
- [Portão do desenho na liberação](torg_portao_desenho.md) — só desce marca com PDF em 2.5.2; 2.5.5 (envio ao cliente) nunca conta; conferência tem que cobrir a LPC atual
- [GRD da Engenharia (FORM 09)](torg_grd_engenharia.md) — /engenharia/grd lê a pasta 13. GRD por OP; alerta só R01 de quem já desceu; nº baixa o original (auditoria)
- [GRD / desenhos da Engenharia](torg_grd_desenhos.md) — modal nas telas de produção/PCP busca PDFs (formato A1–A4 pela pasta 2.5.2 Fabricação); Imprimir+GRD grava GrdLiberacao
- [Regularizar GRD de corte fora do portal](torg_grd_regularizacao.md) — data = 1º apontamento; NUNCA assinar por quem não emitiu nem carimbar retroativo
- [R no carimbo: um só, igual nos dois desenhos](torg_r_carimbo_desenho.md) — nunca 2 R; conjunto leva o R de cada posição na tabela + o R do consumível
- [Emitir desenho rastreado](torg_desenho_rastreado.md) — "Emitir rastreado" carimba R/corrida + quem emitiu no PDF, arquiva e amarra na §02 do Data Book; cuidado com /Rotate e escala A1

### Convenções de UI
- [Padrão das planilhas (xlsx)](torg_excel_padrao.md) — "padrão das planilhas" = `lib/excel-relatorio.js` (`criarRelatorioTorg`, ISO 9001 + logo); import dinâmico no client
- [Padrão dos e-mails](torg_email_padrao.md) — faixa navy `#0D1F3C` + filete laranja `#F4801F`; `cabecalhoEmail()` de lib/email-layout.js; corpo/botões (#006EAB) iguais
- [Logo no avatar do e-mail (BIMI)](torg_bimi_logo_email.md) — trocar "WT" pelo logo = BIMI (DNS+certificado VMC/CMC pago); DMARC já ok, falta BIMI; PARADO p/ depois
- [Capricho visual (feedback)](torg_ui_capricho.md) — alinhamento/quebra/plural é ponto fraco recorrente; espelhar o padrão e conferir o PDF ANTES de subir
- [Input perde o foco a cada tecla](torg_input_perde_foco.md) — componente com <input> definido DENTRO do pai remonta a cada render ("clicar número por número"); usar useComponenteEstavel de lib/react-estavel.js
- [Peso sempre em kg](torg_peso_kg.md) — nunca t/ton no portal (exceto comercial/frete e admin/metas)
- [Acabamento galvanizado](torg_acabamento_galvanizado.md) — galvanizado pula jato+pintura; há obra que pinta DEPOIS; regra dita, não implementada

### Planejamento
- [Início de Produção](torg_inicio_producao.md) — datas por setor (lê cronograma) → solicitação ao PCP/Produção + PMP
- [Enviar cronograma ao cliente](torg_cronograma_envio_cliente.md) — botão manda PDF anexo; contatos do CLIENTE ficam na OP (`OP.clienteContatos`) e voltam prontos
- [Cronograma — lead/lag, área, período](torg_cronograma_periodo.md) — antecipar é NORMAL (`defasagemDias` negativo, FS não rígido); agrupar por área; período grava e corta na borda do Gantt
- [Cronograma × Syneco](torg_cronograma_syneco.md) — avanço das linhas auto do Syneco por frente/fase; falta expedição+histórico+snapshot
- [Cronograma por LISTA de peças da fase](torg_cronograma_por_lista_de_fase.md) — lote com `PecaLote` mede pela lista, não pela letra; marca repartida preenche na ordem de entrega; `qtdNoConjunto` é TOTAL; OP-105 = tarefa `op105-fases-por-tag` + importar T105B pela tela
- [Cronograma — avanço manual prevalece](torg_cronograma_avanco_manual.md) — `avancoManual` na tarefa; Syneco/CMR não sobrescrevem; estoque conta como recebido; % geral ponderado por duração
- [Cronograma](torg_cronograma.md) — antecessoras cross-setor cascateiam; 2 motores: recalcular (só desloca) vs gerarDatasCronograma ("Gerar Datas")
- [Meta da preparação = 6.000 kg/dia](torg_meta_preparacao.md) — base dos "dias de carga" (/pcp/carga-corte), não a média do Syneco
- [Prioridades por setor (TV kg)](torg_prioridades_setor.md) — /planejamento/prioridades e /pcp/dashboard-prioridades = MESMO componente; rota da peça pela estrutura da LPC (ConjuntoCroqui); corte 3 estados; Montagem só conjuntos montáveis
- [Itens comprados (ignorar na produção)](torg_itens_comprados.md) — parafuso/porca/arruela/chumbador/telha/calha/… fora do fluxo de fábrica (lib/item-comprado.js: nome + guard de fabricação); valem p/ Eng/Compras/Planej/Expedição; LE tem 100%
- [Croqui não se expede](torg_croqui_nao_expede.md) — quem embarca é o CONJUNTO; portal da Expedição lê só CONJUNTO; filtrar e avisar
- [Regras de formação de carga (Expedição)](torg_carga_regras.md) — protótipo 3D local (127.0.0.1:3115); pacotes por frente, pilha de guarda-corpo, separar estrutura × delicado, transporte especial >14 m/>2,60 m; em pé SÓ com embalagem (engradado/cavalete), NADA inclinado; 3 PERFIS = só EMBALAGEM (viagens sempre no mínimo) + menor veículo por carga; caixa orientada, não a do prédio
- [Envio a terceiro (romaneio RT)](torg_romaneio_terceiro.md) — painel Liberar "Terceiro" → fornecedor Prestadores + romaneio RT-## à parte + setor de retorno + aba Terceiros na OP + SharePoint "Romaneios terceiros"; reusa RomaneioTerceiro/Excel/APIs de Expedição

### Financeiro / Diretoria
- [Contas a pagar — OP via projeto Omie](torg_contas_pagar_op.md) — OP sai do `projetoCodigo`→getProjetosInfo() (projetos Omie=OPs); Diretoria→A pagar; falta replicar no Financeiro
- [Custo-hora por setor](torg_custo_hora.md) — base do valor/hora (Comercial); preço = custo×(1+margem)÷(1−impostos); Torg+VMI=1 empresa, 8 setores; fator médio ≈2,02
- [Saúde Financeira da OP](torg_saude_financeira_op.md) — aba Financeiro: previsto × realizado por família, auditável; export Excel em 6 abas
- [⏳ Relatório final da OP (PDF)](torg_relatorio_final_op.md) — PROJETO ADIADO, Vitor pediu pra ser lembrado: fechamento da OP 100% com todos os setores
- [Orçado × real em quantidade](torg_orcado_x_real_quantidade.md) — m² de pintura e kg da lista de expedição vs estudo; erro de orçamento recorrente (OP-085 +116%)
- [Receita × verba de compra](torg_receita_x_verba.md) — receita = o que FATURA (venda); itens do contrato = o que o Compras pode GASTAR (custo); impostos na aba BDI
- [Aba Financeiro — margem de transformação](torg_financeiro_margem.md) — custo operacional rateado por produção × receita; material FD fora; janela 2026+; falta previsão (fase 2)
- [Previsão de faturamento](torg_financeiro_previsao.md) — /financeiro/previsao; carga = peso × R$/kg (OP.valorFaturarPorKg); data/peso da PlanejamentoCarga, NÃO do cronograma; sem R$/kg ou peso = "em aberto"

### Qualidade
- [Não declarar furo nosso em doc do cliente](torg_nao_declarar_furo.md) — data book/carimbo/portal: falta dado = "—", nunca frase; motivo só em tela interna
- [FORM do SGQ vai no documento](torg_sgq_form_identificacao.md) — carimbo no rodapé/célula G7, NÃO no nome do arquivo (ISO §7.5.2); índice mestre manda, 11 FORMs inativos
- [Pintura e tinta](torg_pintura_tinta.md) — mede em m² (não kg); PLP dá demãos/cor/SV; caderno de 3 folhas com fórmulas vivas; FEFO; por que "quanto falta" ainda não é afirmável
- [Pintura tem DUAS telas](torg_pintura_duas_telas.md) — campo (Alexandre Stival, stival2112@gmail.com — ex-"Lais" —, só QUALIDADE_CAMPO) × computador; ajuste pedido por inspetor vai no de campo
- [Quadros de assinatura: uma regra só](torg_relatorio_quadros_assinatura.md) — `quadrosDeAssinatura`: papel do convite pela posição, cada assinatura num quadro, inspetor = aprovador vira um quadro; o dimensional tinha cópia velha
- [.env.local sem RESEND](torg_env_local_sem_resend.md) — script local não manda e-mail (chave vazia); reenvio de convite por script falhou calado em 21/09
- [Pintura: condição ambiental por ETAPA](torg_pintura_condicoes_por_etapa.md) — jato/fundo/demais demãos; demão sem leitura herda a do jato (e diz); item 5.4 julga cada etapa
- [Pintura: numeração das fotos](torg_pintura_fotos_numeracao.md) — "3 de 8" dentro do ENSAIO, em lib/fotos-evidencia.js; legenda não repete o nome do ensaio
- [Pintura: micragem seca mínima](torg_pintura_micragem_minima.md) — é do RELATÓRIO (editável nas 2 telas); PLP dá o total da obra; fundo ainda é julgado contra o total
- [Inspetor vê produto final por FASE](torg_inspetor_produto_final_fase.md) — /api/campo/pecas: sem croqui (só `croquis=1` no dimensional avulsas) nem acessório (AC c/ hífen, comprado); `fase`/`fases` da frente da LPC ou letra da marca; chips FiltroFase nas 2 telas
- [Portal da Qualidade](torg_qualidade.md) — setor (PQ-00/NBR 16775) na main; F1 Controle de Documentos, F2 CMR+casamento PDFs, F3/F5 Data Book (pdf-lib); falta F4 foto PWA
- [Cotas A/B/C no dimensional](torg_cotas_abc.md) — cota simples com letra+espec+tolerância; a cota desenhada APONTA onde medir, não mede (some o problema de escala)
- [Data Book — revisão e certificados](torg_databook_revisao.md) — emitido só muda por REVISÃO (zera assinaturas); validade congela na emissão; certificado puxa a ficha do CMR pelo R
- [Anexo da Qualidade: itemId morre](torg_anexo_qualidade_itemid.md) — mover/renomear no SharePoint mata o `sharepointItemId`; a escada (drive provável → o outro → CAMINHO) vive em `lib/databook-arquivo.js` e TODO download passa por ela
- [Planos de Ação 5W2H](torg_qualidade_plano_acao.md) — 3ª ABA de Auditorias Internas; 5W2H + status por ação (atrasado derivado do prazo); PDF paisagem; PlanoAcao (PA-001)
- [RNC — Não Conformidades](torg_rnc.md) — /qualidade/rnc; NaoConformidade cobre FORM 20 + RTNC; 5 porquês; liga ao 5W2H; falta 2b (anexo+IA→plano→PDF) e 2c (indicadores)
- [Auditorias Internas](torg_qualidade_auditorias_internas.md) — /qualidade/auditorias-internas (≠ Externas); cronograma + relatório enxuto → PDF → e-mail; AuditoriaInterna (RAI-001). Cronograma tem Exportar PDF + Enviar p/ assinatura + revisão (f7e9a96 antes) [[torg_assinatura_doc]]
- [Auditorias Externas](torg_auditorias_externas.md) — /qualidade/auditorias (model Auditoria); portal de docs p/ o auditor (msg+capa+token, já existia) + relatório INTERNO novo (RAE; constatações + plano 5W2H PRÓPRIO + fotos + conclusão + PDF; e7b00fb). Relatório/plano não vão ao portal. Falta: Vitor migrar relatórios da Interna p/ Externa
- [Portal — Estrutura em 3D](torg_portal_estrutura_3d.md) — aba Estrutura do portal do auditor mostra planta dos galpões em 3D (iframe self-contained em /public/estrutura-3d) + toggle 2D; exceções de framing (next.config) e middleware
- [Import CMR — performance](torg_qualidade_import_cmr.md) — ~17MB dava OOM no ExcelJS; erro confundia; FIX = SheetJS (lê só a aba do ano); 145 certificados
- [Calibração — avaliação de certificados](torg_calibracao.md) — /qualidade/calibracao (novo 11/08); avalia certs de EQUIPAMENTOS (reaproveita Controle de Docs, 54) → Aprovado/Reprovado (PO-20)+PDF; AvaliacaoCalibracao (RAC); avaliar SEM anexo obrigatório (foto/relatório opcionais, 15/08); nomenclatura/duplicatas em limpeza (aguarda Vitor); critérios editáveis em lib/calibracao.js

### Arquitetura
- [Indicadores por setor](torg_indicadores.md) — /indicadores; default "mês atual"; prontos Compras/Comercial/RH/Produção; pendentes Planejamento-PCP/Expedição/Qualidade
- [Indicadores da Qualidade (ISO)](torg_indicadores_iso.md) — /qualidade/indicadores; 18 da planilha ISO; F1 ligou 7 auto+2 parcial; conversão 100% e prazo fabricação 0% (datas OP não confiáveis)
- [Indicadores ISO do Comercial](torg_indicadores_comercial_iso.md) — /comercial/indicadores LÊ da planilha RELATÓRIO_PROPOSTAS (aba Indicadores, linha GERAL); Conversão + Ciclo de Vendas + CSAT (pendente)
- [Orçamento × LQC — um número só](torg_orcamento_lqc_numero.md) — LQC-nnn-aa É o orçamento nnn-aa; estudo sem orçamento CRIA o orçamento; planilha entra por cron; ⚠ cron da Vercel usa GET
- [Medir a Engenharia + agente de e-mail](torg_engenharia_medicao.md) — o agente EXISTE e roda (Mail.Read ok); falta classificar. Dossiê "Posição do Cronograma" na aba da OP
- [Análise Crítica de Projeto (PO-13)](torg_analise_critica_po13.md) — bloco na aba Engenharia da OP; 7 blocos (3 e 4 não estão no PO); FORM 08 Rev.02 sai do registro; PDF em 2.9 Análise Crítica
- [Portal de Engenharia](torg_portal_engenharia.md) — /engenharia sobre PecaConjunto (Tekla/LPC); Vitor quer o PORTAL antes dos indicadores; roadmap Importar Tekla→Revisões→Reconciliação→Indicadores
- [Equivalência de material (perfil)](torg_equivalencia_material.md) — Tekla diz CH12, a lista diz CH12,5; `\S\X` do IFC = Ø; nunca casar perfil por string crua
- [Dado histórico não fecha 100%](torg_dado_historico_incompleto.md) — obra antiga: medir, dizer o tamanho e PARAR; corrigir a regra que erra de novo, não o passado
- [⚠ Produção é LPC — sempre escolher a lista](torg_producao_e_lpc.md) — `SO_FABRICACAO` em toda consulta de fabricação; registro da LE mente sobre prontidão
- [LPC: chave numérica duplica marcas](torg_lpc_chave_duplicada.md) — arquivo com várias fases entra sob o número da obra e duplica; import avisa e o Planejamento exclui a linha errada
- [Listas LE/LPC (Engenharia)](torg_listas_le_lpc.md) — import → PecaConjunto (LE_IMPORT/LPC_IMPORT); DUAS "LEs"; bug opId órfão ("78"≠"078"); itens AC pro fim (lib/marca-ac.js)
- [Kick Off da OP](torg_kickoff.md) — /comercial/[id]/kickoff, 2 tipos GERAL (sem R$) e FISCAL (com R$); "Divulgar" e-mail+aceite por token; PDF pdf-lib padrão Torg
- [Apresentação ao Cliente](torg_apresentacao_cliente.md) — /comercial/apresentacoes; página pública /apresentacao/[token] (capa+boas-vindas+docs); Resend; tabelas por SQL
- [Acesso & notificações](torg_acesso_notificacoes.md) — acesso por `user.modulos[]` (requireRole = módulos); sino in-app só Compras; Eng/Produção dependem de e-mail
- [Consulta de estoque em barras](torg_consulta_estoque_barras.md) — resposta sempre em barras; cotação/pedido Omie com o líquido; falta atendimento parcial
- [Faturamento direto](torg_faturamento_direto.md) — FD por item da OP; RMItem→OPItem nunca vinculado (usar lib/faturamento-direto.js, fallback por categoria)
- [Status de compra (CMR)](torg_status_compra_cmr.md) — Preparação mostra material comprado/recebido; fonte é o CMR do Almoxarifado, não o Omie; sync diário
- [CMR: a planilha manda; o R se confere nos dois lados](torg_recebimento_cmr.md) — R 261547 saiu com identidade de PORCA e certificado de CHAPA; planilha sobrescreve (célula vazia não apaga), R conferido antes de emitir, sem planilha não emite
- [Recebimento pelo CMR](torg_recebimento_cmr.md) — item da RM baixa pelo CMR (FIFO, kg, ≥95%); Omie só no que não passa pelo CMR
- [Rastreabilidade — o R por peça](torg_rastreio_corrida.md) — o R manda (puxa corrida/cert/NF); FIFO pela entrega mais antiga; só peça CORTADA ganha R; armadilha da chapa sem "ESPESSURA"
- [Portal do cliente: naLPC/naLE + "aplicado em"](torg_portal_cliente_nalpc.md) — revisão da LPC gravava naLPC=false (OP-113 invisível ao cliente); certificado mostra o perfil do projeto; certificado sem PDF = pasta; LE só entra por Status da obra › Importar
- [Portal do cliente — LPC com R por croqui (opcional)](torg_portal_lpc_rastreio.md) — `mostrarRastreio` por obra; lib/rastreio-lpc = 3 caminhos do carimbo; conjunto em branco, corrida N/A vazia; LE da 113 perdeu 120 estruturas em 03/09 → reimportar T113-LE-R00
- [Os TRÊS caminhos do R no croqui](torg_r_tres_caminhos.md) — corte (fato) > amarração > material da obra (NA_OP); o 3º faltava e a OP-113 saiu sem R
- [OP-089 — fechamento do R (307 "sem R")](torg_op089_r_fechamento.md) — cantoneira 1.1/2" de estoque (R 260129), U dobrado lançado pela espessura da tira, chapa 12,5 de estoque (lote mais recente ANTES do corte), grade não é peça; 28 amarrações SEM_R + §04 com 7 certs de outras obras
- [Marca NÃO é única na OP](torg_marca_nao_unica.md) — sub-obras repetem a marca com perfil diferente; indexar só por marca dá R errado no carimbo (`rastreioDaPeca`)
- [Lista de separação de material](torg_separacao_material.md) — botão "Separação" no painel de Liberar; barras/peso + R por material, com troca do R (fardo mais acessível)
- [Fila de corte → PMP](torg_fila_corte.md) — kanban /pcp/fila-corte, metas na PecaConjunto, PMP auto (lote por dias úteis); OP precisa estar cadastrada
- [Programação de corte dia a dia](torg_programacao_dia.md) — cada peça tem o SEU dia; adiar move o dia mas NUNCA o original (senão some o atraso); cota por busca binária
- [Montagem → Solda](torg_montagem_solda.md) — ABA dentro de /planejamento/datas-setor (não tela solta); dia por conjunto; fila da solda SUGERE bancada; /pcp/solda ≠ /pcp/fila-solda
- [Liberar montagem: conjunto PENDENTE](torg_liberar_montagem_pendente.md) — status do conjunto não diz nada sobre corte; filtrar por CORTE escondeu 197 lotes
- [Croqui cortado = regra única](torg_croqui_cortado_regra_unica.md) — `croquiCortado` (Syneco OU corteConcluidoEm OU baixa) em TODA prontidão; select com `CROQUI_PRONTIDAO_SELECT`; OP-113 "2/2 pronto" × "1/2 cortados"
- [Baixa em massa × marcar conjunto (OP-113)](torg_baixa_em_massa_113.md) — baixa por obra declarou U cortado sem corte; "marcar conjunto" engoliu 30 chapas-posição; baixa é POR PEÇA, posição de conjunto nunca vira conjunto
- [Capacidade da montagem](torg_montagem_capacidade.md) — mede-se em PEÇAS por faixa de peso, NUNCA em kg (35→36 pç/dia com kg caindo 3×); repartir por dias-bancada; meta = p75
- [Excluir OP — cascade](torg_excluir_op.md) — DELETE bloqueia com RM e não limpa PCP/produção/qualidade; ~15 FKs opId sem onDelete; precisa force-delete em transação
- [Excluir peças selecionadas — permissão](torg_excluir_pecas_perm.md) — delete-por-ids (`/api/producao/pecas` {ids}) = UNIÃO dos perfis das telas que servem o ProgramacaoCorteClient (Corte/PCP/Fila/Listas Eng/Expedição); OP inteira só ADMIN; `User.modulos`=objetos no DB, strings na sessão
- [OP em vistas/abas](torg_op_vistas.md) — detalhe = 5 abas (Resumo/Engenharia/Produção/Expedição/Financeiro); Fase 1 no ar; Produção/Financeiro/romaneios pendentes
- [Materiais da OP (compras)](torg_materiais_op.md) — MateriaisOPSection: solicitado→pedido→NF→recebido; RMItem.peso=kg, qtd=barras; API /api/op/[id]/materiais
- [OP.refCliente](torg_op_refcliente.md) — código do CLIENTE p/ a obra (≠ obra/numero); editável; aparece nos docs ao cliente; doc novo ao cliente DEVE incluir
- [PecaConjunto.opNumero = código SKA](torg_pecaconjunto_opnumero.md) — LPC guarda T67B, não 067; casa por opId (a4c5775); frentes reconciliadas 17/06
- [Chave da LPC = FASE, nunca a OP](torg_lpc_chave_fase.md) — "094" × "T94A" duplicou 591 marcas na programação do corte; lib/lpc-chave.js; toda tela manda arquivoNome; resíduos na 089/113/067
- [Fluxo da Produção (Diretoria)](torg_fluxo_producao.md) — Eng→programador→setor; 4.576 itens fora do mapa, OP-067 parada há 31d
- [Módulo Diretoria (restrito)](torg_modulo_diretoria.md) — /diretoria tem allowlist própria (lib/diretoria.js); ADMIN NÃO burla; dono vitor@torg.com.br. Não usar requireRole lá
- [Painel /admin + alerta de cron = allowlist](torg_admin_portal_allowlist.md) — Vitor e Matheus; os outros 3 ADMINs seguem full, sem painel
- [Status da obra / Listas de Expedição](torg_status_obra.md) — Lista Avançada Expedição.xlsm em SharePoint `OP/4. Expedição`; aba PROJETO (marcas+expedido/faltante); falta cruzar romaneios + cron
- [Expedido parcial por marca](torg_expedido_parcial_marca.md) — quanto saiu vem POR ROMANEIO (lib/expedido-por-romaneio.js); booleano sumia com marca pela metade; reimportar a lista por obra
- [Item avulso no romaneio](torg_romaneio_item_avulso.md) — tinta de retoque e afins vivem só na carga (FORM 22 coluna Unid.); `itensDeObra` mantém o avulso fora de toda conta de peso da obra
- [Importar romaneios da pasta](torg_import_romaneios.md) — FORM 22 do SharePoint → portal (só obra antiga); ⚠ romaneio EMITIDO ≠ embarcado: escolher quais saíram
- [Expedição → baixa no cronograma](torg_expedicao_cronograma.md) — linha "Expedição" alinha c/ expedido das listas (FORM-22); % da ESTRUTURA em kg, itens fora editáveis em /planejamento/config-expedicao; avança só
- [Romaneio a partir da carga + FORM 22](torg_romaneio_carga.md) — romaneio da carga (PlanejamentoCarga); tirar peça exige motivo; gera FORM 22 (.xlsm base64, exceljs) em 4.2 Romaneios; A4 scale=20 era o bug
- [Módulo Fiscal](torg_fiscal.md) — /fiscal; romaneio EMITIDO cai na fila aguardando NF; informa número+tipo → FINALIZADO; campos nf* no RomaneioPrevio
- [Apontamento Syneco por setor](torg_syneco_apontamento_fonte.md) — somar `mesApontamento` por `dataInicio` (BRT), normalizar via lib/syneco-dia.js; NUNCA `mesOrdem` (cumulativo)
- [Planilha "Apontamentos para o Syneco"](torg_apontamentos_syneco_planilha.md) — baixa do portal − Syneco, por marca/setor; card em Produção › Meu trabalho + botão por OP/setor; lib/apontamentos-syneco.js
- [Syneco: vínculo obra→OP](torg_syneco_obra_vinculo.md) — `obra` sem prefixo T = órfão invisível (caso OP-92, 126 t); lib/syneco-obra.js
- [Programação (o programador lançou?)](torg_programacao_syneco.md) — peça lançada = tem `MesOrdem`; ordens nascem pra rota inteira; Syneco separa Corte(10) de Preparação(20)
- [Etapa da peça: conjunto herda do croqui](torg_etapa_conjunto_croqui.md) — corte é apontado no CROQUI; uma função só (`etapaDasMarcas`) para toda tela de "onde está"
- [Setor real da peça (≠ status)](torg_peca_setor_real.md) — status auto só até CORTE; setor real vem do `mesOrdem produzidoUn>0` (tela Status da Obra); usado na Expedição Semanal
- [Planejamento › Tarefas](torg_tarefas_planejamento.md) — Semanais/Cronograma/Cobrança/Respostas; lista fixa lib/contatos-tarefas.js; TarefaResposta (cliente/setor por token) ≠ CronogramaTarefa
- [Módulo Reuniões (Atas ISO)](torg_reunioes.md) — /reunioes (ADMIN/PLANEJAMENTO); ata semanal nº=semana ISO (ATA-029)+revisão; atividades por IA/OP e por setor; link /ata/[token] confirma+responde; AtaReuniao/AtaAtividade/AtaConfirmacao (SQL)
- [Assinatura eletrônica de documentos](torg_assinatura_doc.md) — fluxo genérico p/ validar doc por setor: PDF padrão Torg + envio por e-mail + `/assinar/[token]` (confirmação+data+IP) + revisão auto; EnvioAssinatura/AssinaturaDocumento/DocumentoRevisao (por `tipo`); usado em Plano de Treinamentos e Cronograma de Auditoria
- [Não sobrescrever arquivo com `cat >`](torg_nao_sobrescrever_arquivo.md) — conferir `ls`/`git ls-files` antes; ` M` no git status onde eu esperava `??` = sobrescrevi algo
- [Baixa de etapa anterior (Produção)](torg_baixa_etapa_anterior.md) — "Apontamento numa etapa à frente dá baixa nas anteriores — a peça jateada foi montada e soldada, mesmo sem registro"
- [OP-122 Vale/TMSA + Tekla](torg_tekla_tmsa_vale.md) — acompanhamento no formato TMSA (avanço, mapa, romaneio); SKU é da TMSA; pacote Tekla 2025 em docs/tekla-tmsa-vale
- [OP-122 — contrato TMSA e o adiamento da Vale](torg_op122_contrato_adiamento.md) — OS1 = 530,7 t/R$ 10,27 M até 29/01; "176 t" é ritmo mensal; contrato NEGA indenização por ociosidade (3.2.2/13.5); alavancas: 15% contra seguro+ARTs, autorização de compra (13.3-c), novas datas (3.2.5); custo do adiamento R$ 38,8 mil/dia
- [Branch de outra sessão](torg_branch_de_outra_sessao.md) — conferir `git rev-parse --abbrev-ref HEAD` antes de commitar; se não for main, worktree de main; nunca `reset --hard` no diretório dos outros
- [Simulador de carga no portal](torg_simulador_carga_portal.md) — "Simular carga" no romaneio prévio; motor lib/carga em Web Worker; IFC medido no navegador; CargaSimulada com itensHash
- [Usuário sem e-mail (login por CPF)](torg_usuario_sem_email.md) — Admin › Usuários vincula ao funcionário do RH; e-mail interno cpf@funcionario.torg; RH › Habilitar acesso é só autoatendimento
- [Permissões das pastas da OP (SharePoint)](torg_permissoes_pasta_op.md) — acesso é por usuário individual, não por grupo; "Acesso Limitado" engana a contagem; OP nova nasce liberada; conceder/remover em massa por `scripts/permissoes-sharepoint.mjs`; Colaboração ≠ Editar
- [Import da L.E. é manual](torg_le_import_manual.md) — cron diário só AVISA (nunca importa); `?simular=1` não avisa nem bate heartbeat; olhar a pasta antes de achar que é ruído
- [Conversão em massa de JSX](torg_conversao_em_massa.md) — o que só o `npm run build` pega: `'use client'` deslocado, import dentro de import multilinha, e o conversor mordendo o próprio componente
- [E-mail de cliente com @torg.com.br](torg_email_cliente_dominio_torg.md) — OP-106 2× em set/2026: Resend aceita, ninguém recebe, portal do cliente não mostra (casa pelo e-mail da sessão); conferir domínio
- [Certificado movido no SharePoint some do data book](torg_databook_certificado_movido.md) — OP-106: item 404 vira pendência silenciosa; 4º degrau busca pelo nome; ler `pendencias` antes de aceitar
- [Referências do cliente + aditivo como pedido novo](torg_referencias_cliente_aditivo.md) — papéis fixos (PROJETO/PEDIDO/ITEM/TAG), palavras por cliente (Cliente.termos), refCliente derivado; aditivo com status/valor/receita e comunicado com aceite por setor
- [Filtrar depois de cortar esconde dado](torg_filtro_antes_do_corte.md) — `take:100` + filtro no cliente escondia 111 RMs e 11 obras SUMIAM do seletor; obra na URL filtra no banco sem teto, opções por `groupBy`, corte visível; Aluguel/Montagem corrigidos antes de sangrar (lá o corte deixava o TOTAL EM R$ parcial)
- [Portal do cliente — Pedidos e faturamento](torg_portal_cliente_faturamento.md) — só por login + papel FATURAMENTO no contato da OP (Admin › Usuários + aba Obra › Contatos e acessos); OC casa pelo campo do pedido Omie; NF via ConsultarNF guardada em NotaFiscalOmie; Excel por OC
- [Previsão de entrega: 4 fontes](torg_previsao_entrega_fontes.md) — ordem remarcação > pedido > item da cotação > texto ("18 dias úteis") contado da criação; a conta ia pro Omie e não era guardada; regra de "chegou"; pedido de compra ENCERRADO ainda pendente
- [Token da cotação vazava no payload](torg_token_cotacao_no_payload.md) — `include` sem `select` mandava `Cotacao.token` (chave do portal público do fornecedor, sem login) para o HTML da tela da OP; conferido no HTML, corrigido na serialização; procurar o segredo no HTML, não no código
- [Sync SharePoint do PCP + retry do Graph](torg_sync_sharepoint_pcp.md) — nome do arquivo com o mês no fim; aba EAP de outro mês é RECUSADA (está congelada em junho); CMR retenta 504
- [Prazo proposto pelo fornecedor](torg_prazo_proposto_fornecedor.md) — a data do link público virou PROPOSTA; Compras aprova/recusa; `prazoPropostoId` é a versão (409); dois efetivadores; ⚠⚠ prazo se formata em UTC, não São Paulo (mostrava um dia antes)
- [Desenho da inspeção cortado: /Rotate](torg_desenho_rotacao_pdf.md) — PDF.js dá viewport girado e operator list crua; filtro descartava o traço em silêncio e "ajustar recorte" não salvava; matriz única em lib/geometria-pagina.js, identidade quando rotate=0
- [GERDAU responde só com PDF — digitação manual](torg_gerdau_pdf_manual.md) — DECISÃO, não defeito; 27 de 31 cotações com PDF anexado e zero preço são dela; ⚠ anexar não envia e ninguém é avisado (a mais antiga parada há 115 dias)
- [Cotação: fornecedor sem e-mail (Omie)](torg_cotacao_fornecedor_sem_email.md) — 435 cadastros ativos sem e-mail e 10 com dois no mesmo campo; o clique morria em silêncio (`null.toLowerCase` fora do try); regra em lib/fornecedores-envio.js, linha do picker "informar e-mail" grava no cadastro; ⚠ tudo do submit dentro do try
- [Pré-montagem: vários projetos](torg_pre_montagem_varios_projetos.md) — a regra "um conjunto por relatório" do dimensional barrava o 2º projeto da RPM no servidor; escolher na pasta SOMA na pré-montagem e TROCA nos outros
- [Cliente: obras liberadas](torg_cliente_obras_liberadas.md) — login CLIENTE vê a OP pelo e-mail nos contatos da OP; "Editar contatos" (aba Obra) e "Obras liberadas" (Admin › Usuários) escrevem o mesmo `clienteContatos`
- [Cliente consulta relatório fechado](torg_cliente_relatorio_consulta.md) — relatório de inspeção aparece para o cliente quando TODOS assinam, se a obra estiver liberada; consulta não conta como pendência
- [Ambiente de demonstração](torg_ambiente_demo.md) — Postgres local `torg_demo` (cópia via `scripts/demo-banco.sh`), `MODO_DEMO=1` corta e-mail/Omie e desvia SharePoint para `DEMO/`; worktree ~/dev/portal-compras-demo, porta 3002; ⚠ `npm run dev` grava na produção
- [Total do PDF vem com IPI](torg_total_pdf_com_ipi.md) — a tela comparava contra `preço × qtd` e acendia vermelho em 7 de 7 linhas CERTAS; medido 17/17 a 0,000% em `qtd × preço × (1+IPI)`; quem conhece o layout declara a BASE, e o número exibido continua o impresso; guarda impede a rota da IA de reescrever o preço em +3,25%
- [Editar relatório já assinado](torg_relatorio_editar_assinado.md) — decisão do Vitor: não exige revisão; auditoria marca `editadoAposAssinatura` e a tarja diz quem assinou; revisão fica para o que já saiu ao cliente
- [Cotação: converter unidade do fornecedor](torg_cotacao_unidade.md) — 25 CT ↔ 2500 UN; grava CANÔNICO (unidade da RM) e os 25 consumidores não mudam; total é a invariante; preço convertido NÃO se arredonda a 2 casas
- [Codex: aceito sempre](torg_codex_aceito_sempre.md) — pendência de terceiro/decisão humana não trava mais o fluxo; `corrigir` continua obrigatório, e o P1 dos avulsos é do Vitor
