// Tabelas e índices da INTELIGÊNCIA FISCAL.
//
// Mesma forma dos outros ensure-*: SQL idempotente rodado no `build`, nada de `prisma db push`
// contra produção.
//
// ⚠⚠ O QUE SÓ EXISTE AQUI: o índice único PARCIAL de `FiscalTipiLinha`. A unicidade de verdade é
// (versão, código, ex) SOMENTE nas linhas de nível NCM — as de hierarquia repetem código entre si
// (`8437.8` aparece uma vez, mas `-- Outras` aparece centenas) e não têm alíquota consultável. O
// Prisma não tem sintaxe para índice parcial no `schema.prisma`, então ele mora neste arquivo,
// como o da Conferência de Peça e o da reserva de barra do MES.
//
// ⚠ Sem essa trava, duas importações concorrentes da mesma versão poderiam gravar o mesmo (NCM, Ex)
// duas vezes com alíquotas diferentes, e a consulta escolheria uma das duas em silêncio.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const sql = [
  `CREATE TABLE IF NOT EXISTS "FiscalFonteArquivo" (
     "id" TEXT PRIMARY KEY,
     "fonte" TEXT NOT NULL,
     "url" TEXT NOT NULL,
     "sha256" TEXT NOT NULL,
     "bytes" INTEGER NOT NULL,
     "contentType" TEXT,
     "atoDeclarado" TEXT,
     "baixadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // ⚠ Mesmo conteúdo baixado de novo NÃO vira artefato novo — é o que impede a tabela de crescer
  // uma versão por dia (≈4 milhões de linhas/ano sem necessidade).
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalFonteArquivo_fonte_sha256_key" ON "FiscalFonteArquivo"("fonte","sha256")`,
  `CREATE INDEX IF NOT EXISTS "FiscalFonteArquivo_fonte_baixadoEm_idx" ON "FiscalFonteArquivo"("fonte","baixadoEm")`,

  `CREATE TABLE IF NOT EXISTS "FiscalTipiVersao" (
     "id" TEXT PRIMARY KEY,
     "arquivoId" TEXT NOT NULL,
     "parserVersao" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'IMPORTANDO',
     "problemas" JSONB,
     "observadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aprovadoEm" TIMESTAMP(3),
     "aprovadoPorId" TEXT,
     "vigenciaInicio" TIMESTAMP(3),
     "vigenciaFim" TIMESTAMP(3),
     "vigenciaFundamento" TEXT,
     "totalLinhas" INTEGER NOT NULL DEFAULT 0,
     "totalNcm" INTEGER NOT NULL DEFAULT 0,
     "totalHierarquia" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiVersao_status_observadoEm_idx" ON "FiscalTipiVersao"("status","observadoEm")`,
  // ⚠⚠ UMA VERSÃO ATIVA POR VEZ, GARANTIDO NO BANCO. A promoção troca a referência ativa numa
  // transação curta; sem esta trava, duas importações concorrentes deixariam DUAS ativas e a
  // consulta passaria a depender de qual linha o Postgres devolvesse primeiro.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalTipiVersao_uma_ativa" ON "FiscalTipiVersao"("status") WHERE "status" = 'ATIVA'`,

  `CREATE TABLE IF NOT EXISTS "FiscalTipiLinha" (
     "id" TEXT PRIMARY KEY,
     "versaoId" TEXT NOT NULL,
     "ordem" INTEGER NOT NULL,
     "nivel" TEXT NOT NULL,
     "codigo" TEXT NOT NULL,
     "codigoFormatado" TEXT NOT NULL,
     "ex" TEXT NOT NULL DEFAULT '',
     "descricao" TEXT NOT NULL,
     "aliquotaTipo" TEXT NOT NULL,
     "aliquotaValor" DOUBLE PRECISION,
     "aliquotaBruto" TEXT NOT NULL,
     "linhasDeOrigem" INTEGER[]
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalTipiLinha_versaoId_ordem_key" ON "FiscalTipiLinha"("versaoId","ordem")`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_versaoId_codigo_idx" ON "FiscalTipiLinha"("versaoId","codigo")`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_codigo_ex_idx" ON "FiscalTipiLinha"("codigo","ex")`,
  // ⚠⚠ A TRAVA QUE SÓ O SQL EXPRESSA (ver o cabeçalho).
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalTipiLinha_ncm_unico" ON "FiscalTipiLinha"("versaoId","codigo","ex") WHERE "nivel" = 'NCM'`,
  // ⚠ Busca por DESCRIÇÃO ("estrutura metálica", "guarda-corpo") sem varrer 11 mil linhas.
  `ALTER TABLE "FiscalTipiLinha" ADD COLUMN IF NOT EXISTS "descricaoCompleta" TEXT NOT NULL DEFAULT ''`,
  // ⚠⚠ O GIN VAI NA DESCRIÇÃO COMPLETA, NÃO NA DA FOLHA. Medido: 2.603 dos 11.103 NCMs (23%) são
  // descritos só como "Outros"/"Outras" — buscar "construções pré-fabricadas" na folha devolvia ZERO,
  // porque as palavras moram na POSIÇÃO 94.06, duas linhas acima do 9406.90.20.
  `ALTER TABLE "FiscalTipiLinha" ADD COLUMN IF NOT EXISTS "busca" TEXT NOT NULL DEFAULT ''`,
  // ⚠⚠ O ÍNDICE VAI NA COLUNA SEM ACENTO. `to_tsvector` não remove acento: indexando o texto com
  // acento, "construcoes pre-fabricadas" devolvia ZERO, e `plainto_tsquery` junta os termos com E —
  // um acento faltando derruba a consulta inteira.
  // ⚠⚠⚠ O NOME É `_busca_pt` E NÃO `_busca` POR CAUSA DE UM DEFEITO QUE CUSTOU 326 ms POR BUSCA.
  // Medido em 22/09/2026 contra a produção: `FiscalTipiLinha_busca` existia — mas sobre
  // `descricaoCompleta`, a definição ANTERIOR à criação da coluna `busca`. E `CREATE INDEX IF NOT
  // EXISTS` casa pelo NOME, não pela definição: quando a linha aqui mudou de coluna, o Postgres
  // viu o nome, disse "já existe" e MANTEVE o índice velho, em silêncio.
  //
  // ⚠⚠ RESULTADO: toda busca textual de NCM varria as 11.103 linhas calculando `to_tsvector` em
  // cada uma — 326 ms onde o índice entrega 0,7 ms. Nada quebrou, nada avisou; só ficou lento.
  // Trocar o nome é o que faz o `IF NOT EXISTS` voltar a significar o que ele parece significar.
  //
  // ⚠ O índice antigo, sobre `descricaoCompleta`, ficou órfão: nenhuma consulta o usa e ele só
  // pesava nas importações. Derrubado com autorização do Matheus (22/09/2026, "pode seguir com
  // todas"). ⚠⚠ O DROP é CONDICIONADO à definição: se algum dia `FiscalTipiLinha_busca` voltar a
  // existir sobre a coluna CERTA, este bloco não o remove — derrubar às cegas pelo nome seria o
  // mesmo erro do `IF NOT EXISTS`, só que na direção oposta.
  `DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_indexes
                 WHERE tablename = 'FiscalTipiLinha' AND indexname = 'FiscalTipiLinha_busca'
                   AND indexdef LIKE '%descricaoCompleta%')
     THEN EXECUTE 'DROP INDEX "FiscalTipiLinha_busca"';
     END IF;
   END $$;`,
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_busca_pt" ON "FiscalTipiLinha" USING GIN (to_tsvector('portuguese', "busca"))`,
  // ⚠⚠ O SEGUNDO ÍNDICE É `simple`, E ELE EXISTE POR CAUSA DO AUTOCOMPLETE. Medido em 22/09/2026:
  // `to_tsquery` NÃO aplica stemming ao termo marcado com `:*` — "metalicas" é indexado como o
  // radical `metal`, então `metalic:*` procura lexema começando em "metalic" e NUNCA casa. Passar
  // do limite do radical, digitando, ZERAVA a lista. Com `simple` não há radical: o prefixo casa
  // letra a letra, que é o que um autocomplete precisa.
  // ⚠ Os dois convivem de propósito: `portuguese` resolve singular/plural de palavra inteira
  // ("construção" acha "construções"); `simple` resolve a palavra pela metade. A consulta usa OR.
  `CREATE INDEX IF NOT EXISTS "FiscalTipiLinha_busca_simple" ON "FiscalTipiLinha" USING GIN (to_tsvector('simple', "busca"))`,

  `CREATE TABLE IF NOT EXISTS "FiscalNcmVersao" (
     "id" TEXT PRIMARY KEY,
     "arquivoId" TEXT NOT NULL,
     "parserVersao" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'IMPORTANDO',
     "atoDeclarado" TEXT,
     "observadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aprovadoEm" TIMESTAMP(3),
     "totalCodigos" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS "FiscalNcmVersao_status_observadoEm_idx" ON "FiscalNcmVersao"("status","observadoEm")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalNcmVersao_uma_ativa" ON "FiscalNcmVersao"("status") WHERE "status" = 'ATIVA'`,

  `CREATE TABLE IF NOT EXISTS "FiscalNcmCodigo" (
     "id" TEXT PRIMARY KEY,
     "versaoId" TEXT NOT NULL,
     "codigo" TEXT NOT NULL,
     "codigoFormatado" TEXT NOT NULL,
     "descricao" TEXT NOT NULL,
     "vigenciaInicio" TIMESTAMP(3),
     "vigenciaFim" TIMESTAMP(3),
     "atoTipo" TEXT,
     "atoNumero" TEXT,
     "atoAno" TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalNcmCodigo_versaoId_codigo_key" ON "FiscalNcmCodigo"("versaoId","codigo")`,
  `CREATE INDEX IF NOT EXISTS "FiscalNcmCodigo_codigo_idx" ON "FiscalNcmCodigo"("codigo")`,
  `CREATE INDEX IF NOT EXISTS "FiscalNcmCodigo_descricao_busca" ON "FiscalNcmCodigo" USING GIN (to_tsvector('portuguese', "descricao"))`,

  `CREATE TABLE IF NOT EXISTS "FiscalSincronizacao" (
     "id" TEXT PRIMARY KEY,
     "fonte" TEXT NOT NULL,
     "disparo" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'RODANDO',
     "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "terminadaEm" TIMESTAMP(3),
     "sha256Visto" TEXT,
     "versaoId" TEXT,
     "mensagem" TEXT,
     "disparadaPorId" TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS "FiscalSincronizacao_fonte_iniciadaEm_idx" ON "FiscalSincronizacao"("fonte","iniciadaEm")`,

  // ─── A BASE JURÍDICA ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "FiscalNorma" (
     "id" TEXT PRIMARY KEY, "chave" TEXT NOT NULL UNIQUE, "tipo" TEXT NOT NULL, "peso" TEXT NOT NULL,
     "orgao" TEXT NOT NULL, "titulo" TEXT NOT NULL, "norma" TEXT NOT NULL, "url" TEXT NOT NULL, "assunto" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "FiscalNorma_tipo_idx" ON "FiscalNorma"("tipo")`,

  `CREATE TABLE IF NOT EXISTS "FiscalNormaVersao" (
     "id" TEXT PRIMARY KEY, "normaId" TEXT NOT NULL, "sha256" TEXT NOT NULL, "bytes" INTEGER NOT NULL,
     "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "corpo" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'ATIVA', "conferido" BOOLEAN NOT NULL DEFAULT false, "faltam" JSONB)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalNormaVersao_normaId_sha256_key" ON "FiscalNormaVersao"("normaId","sha256")`,
  `CREATE INDEX IF NOT EXISTS "FiscalNormaVersao_normaId_coletadoEm_idx" ON "FiscalNormaVersao"("normaId","coletadoEm")`,
  // ⚠⚠ UMA VERSÃO ATIVA POR NORMA, GARANTIDO NO BANCO. Índice PARCIAL — o Prisma não tem sintaxe
  // para isso no schema, e sem ele duas coletas simultâneas deixariam duas ATIVAS da mesma norma,
  // com a tela mostrando uma e o motor citando a outra.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalNormaVersao_uma_ativa" ON "FiscalNormaVersao"("normaId") WHERE "status" = 'ATIVA'`,

  `CREATE TABLE IF NOT EXISTS "FiscalDispositivo" (
     "id" TEXT PRIMARY KEY, "versaoId" TEXT NOT NULL, "rotulo" TEXT NOT NULL, "artigo" TEXT,
     "tipo" TEXT NOT NULL, "texto" TEXT NOT NULL, "ordem" INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDispositivo_versaoId_rotulo_key" ON "FiscalDispositivo"("versaoId","rotulo")`,
  // ⚠ O índice por rótulo é o que faz "quem cita o art. 406, II?" ser uma consulta, não uma varredura.
  `CREATE INDEX IF NOT EXISTS "FiscalDispositivo_rotulo_idx" ON "FiscalDispositivo"("rotulo")`,

  // ─── O REGISTRO DE CLASSIFICAÇÃO DE PRODUTO (§14) ──────────────────────────
  //
  // ⚠⚠ É REGISTRO DE DECISÃO HUMANA, e por isso o autor vai gravado como NOME, não só como id.
  // A decisão precisa continuar legível depois que a pessoa sai da empresa ou tem o cadastro
  // desativado — um `criadoPorId` órfão transformaria "quem aprovou isto" numa consulta que não
  // responde mais.
  `CREATE TABLE IF NOT EXISTS "FiscalClassificacaoProduto" (
     "id" TEXT PRIMARY KEY,
     "codigoProduto" TEXT,
     "padraoDescricao" TEXT NOT NULL,
     "padraoNormalizado" TEXT NOT NULL,
     "ncm" TEXT NOT NULL,
     "fundamento" TEXT NOT NULL,
     "normaChave" TEXT,
     "observacao" TEXT,
     "status" TEXT NOT NULL DEFAULT 'PROPOSTA',
     "substituiId" TEXT,
     "criadoPorId" TEXT NOT NULL, "criadoPorNome" TEXT NOT NULL,
     "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aprovadoPorId" TEXT, "aprovadoPorNome" TEXT, "aprovadoEm" TIMESTAMP(3),
     "revogadoPorId" TEXT, "revogadoPorNome" TEXT, "revogadoEm" TIMESTAMP(3),
     "motivoRevogacao" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "FiscalClassificacaoProduto_status_idx" ON "FiscalClassificacaoProduto"("status")`,
  `CREATE INDEX IF NOT EXISTS "FiscalClassificacaoProduto_codigoProduto_idx" ON "FiscalClassificacaoProduto"("codigoProduto")`,
  // ⚠⚠ DOIS ÍNDICES PARCIAIS, PORQUE NULL NÃO COLIDE COM NULL NO POSTGRES (achado do Codex,
  // 23/09/2026). Um único índice sobre ("codigoProduto","padraoNormalizado") deixaria DOIS
  // verbetes globais aprovados com o mesmo padrão conviverem em silêncio — e a consulta passaria
  // a devolver AMBIGUA para sempre, sem ninguém entender por quê. O segundo índice fecha o buraco
  // sem inventar um código-sentinela, que seria um produto falso no cadastro.
  //
  // ⚠ Eles garantem que não há DUPLICATA de escopo. Não garantem — e não têm como garantir — que
  // dois padrões diferentes não se sobreponham ("FLANGE" e "FLANGE MAIOR"); essa sobreposição é
  // detectada na leitura e sai como AMBIGUA.
  `ALTER TABLE "FiscalClassificacaoProduto" ADD COLUMN IF NOT EXISTS "codigoNormalizado" TEXT`,
  // ⚠⚠ O ÍNDICE VAI NA COLUNA CANÔNICA, NÃO NO LITERAL (achado do Codex, 23/09/2026). Indexando
  // `codigoProduto` cru, `ARM000010` e `arm000010` são escopos DIFERENTES para o índice e o MESMO
  // escopo para a leitura: as duas linhas eram aprovadas e depois casavam juntas, devolvendo
  // AMBIGUA para sempre, sem ninguém entender por quê.
  //
  // ⚠⚠ E OS ÍNDICES ANTIGOS PRECISAM CAIR PELO NOME. `CREATE INDEX IF NOT EXISTS` casa pelo NOME,
  // nunca pela definição — deixar os dois de pé manteria a unicidade errada viva em silêncio, que
  // é exatamente o defeito do `FiscalTipiLinha_busca`. Só cai o que tem o nome antigo.
  `DROP INDEX IF EXISTS "FiscalClassificacaoProduto_aprovada_codigo"`,
  `DROP INDEX IF EXISTS "FiscalClassificacaoProduto_aprovada_global"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalClassificacaoProduto_aprovada_escopo"
     ON "FiscalClassificacaoProduto"("codigoNormalizado","padraoNormalizado")
     WHERE "status" = 'APROVADA' AND "codigoNormalizado" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalClassificacaoProduto_aprovada_geral"
     ON "FiscalClassificacaoProduto"("padraoNormalizado")
     WHERE "status" = 'APROVADA' AND "codigoNormalizado" IS NULL`,

  // ─── A VALIDAÇÃO HUMANA DAS REGRAS DO CÓDIGO ───────────────────────────────
  //
  // ⚠⚠ HISTÓRICO, NÃO ESTADO. Não há índice único por `regraId`: cada decisão é uma LINHA NOVA, e
  // a vigente é a mais recente. Sobrescrever apagaria a contestação que motivou a revisão — e é
  // justamente ela que alguém vai querer ler depois para entender por que a regra mudou.
  `CREATE TABLE IF NOT EXISTS "FiscalValidacaoRegra" (
     "id" TEXT PRIMARY KEY,
     "regraId" TEXT NOT NULL,
     "estado" TEXT NOT NULL,
     "impressao" TEXT NOT NULL,
     "fonte" TEXT,
     "ressalva" TEXT,
     "porId" TEXT NOT NULL,
     "porNome" TEXT NOT NULL,
     "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "FiscalValidacaoRegra_regraId_em_idx" ON "FiscalValidacaoRegra"("regraId","em")`,
  `CREATE INDEX IF NOT EXISTS "FiscalValidacaoRegra_estado_idx" ON "FiscalValidacaoRegra"("estado")`,

  // ── O ASSISTENTE FISCAL ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "FiscalConversa" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL,
     "userNome" TEXT NOT NULL,
     "titulo" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'ATIVA',
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "FiscalConversa_userId_updatedAt_idx" ON "FiscalConversa"("userId","updatedAt")`,

  `CREATE TABLE IF NOT EXISTS "FiscalMensagem" (
     "id" TEXT PRIMARY KEY,
     "conversaId" TEXT NOT NULL,
     "seq" INTEGER NOT NULL,
     "papel" TEXT NOT NULL,
     "chave" TEXT,
     "estado" TEXT NOT NULL DEFAULT 'CONCLUIDA',
     "conteudo" TEXT NOT NULL DEFAULT '',
     "blocos" JSONB,
     "evidencias" JSONB,
     "ferramentas" JSONB,
     "referencias" JSONB,
     "avisos" JSONB,
     "modelo" TEXT,
     "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
     "tokensSaida" INTEGER NOT NULL DEFAULT 0,
     "custoMicros" INTEGER NOT NULL DEFAULT 0,
     "erro" TEXT,
     "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "terminadoEm" TIMESTAMP(3))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalMensagem_conversaId_seq_key" ON "FiscalMensagem"("conversaId","seq")`,
  // ⚠⚠ A IDEMPOTÊNCIA DO REENVIO. Múltiplos NULL não colidem no Postgres, então mensagem do
  // usuário (que não leva chave) não é afetada — a trava vale só para a execução do assistente.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalMensagem_conversaId_chave_key" ON "FiscalMensagem"("conversaId","chave")`,
  `CREATE INDEX IF NOT EXISTS "FiscalMensagem_conversaId_seq_idx" ON "FiscalMensagem"("conversaId","seq")`,
  // ⚠ Por estado e início: é como a reconciliação acha execução abandonada (rota morta no meio).
  `CREATE INDEX IF NOT EXISTS "FiscalMensagem_estado_iniciadoEm_idx" ON "FiscalMensagem"("estado","iniciadoEm")`,

  `CREATE TABLE IF NOT EXISTS "FiscalUsoIa" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL,
     "dia" TEXT NOT NULL,
     "chamadas" INTEGER NOT NULL DEFAULT 0,
     "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
     "tokensSaida" INTEGER NOT NULL DEFAULT 0,
     "custoMicros" INTEGER NOT NULL DEFAULT 0,
     "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  // ⚠⚠ ESTE ÚNICO É O QUE FAZ A RESERVA ATÔMICA FUNCIONAR: o `INSERT ... ON CONFLICT DO UPDATE`
  // do orçamento depende dele para serializar duas chamadas simultâneas do mesmo usuário.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalUsoIa_userId_dia_key" ON "FiscalUsoIa"("userId","dia")`,
  `CREATE INDEX IF NOT EXISTS "FiscalUsoIa_dia_idx" ON "FiscalUsoIa"("dia")`,

  // ⚠ Regras de IBS/CBS aprendidas das NF-e de saída (lib/fiscal/coleta-ibs-cbs.js). O ÚNICO por
  // alíquotas é o que faz divergência virar duas linhas — e o `ON CONFLICT` da gravação depende dele.
  `CREATE TABLE IF NOT EXISTS "FiscalRegraIbsCbs" (
     "id" TEXT PRIMARY KEY,
     "ncm" TEXT NOT NULL,
     "cfop" TEXT NOT NULL,
     "pCbs" DOUBLE PRECISION NOT NULL,
     "pIbsUf" DOUBLE PRECISION NOT NULL,
     "qtdNotas" INTEGER NOT NULL DEFAULT 0,
     "primeiraNf" TEXT, "primeiraEm" TEXT, "ultimaNf" TEXT, "ultimaEm" TEXT,
     "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalRegraIbsCbs_ncm_cfop_pCbs_pIbsUf_key" ON "FiscalRegraIbsCbs"("ncm","cfop","pCbs","pIbsUf")`,
  `CREATE INDEX IF NOT EXISTS "FiscalRegraIbsCbs_ncm_cfop_idx" ON "FiscalRegraIbsCbs"("ncm","cfop")`,

  // ⚠ A identidade do conteúdo da tentativa (pergunta + conversa + anexo). Coluna NOVA em tabela que
  // já existe: `ADD COLUMN IF NOT EXISTS` é idempotente e não reescreve a tabela (nullable, sem default).
  `ALTER TABLE "FiscalMensagem" ADD COLUMN IF NOT EXISTS "tentativaHash" TEXT`,

  `CREATE TABLE IF NOT EXISTS "FiscalAnexo" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL,
     "nome" TEXT NOT NULL,
     "tamanho" INTEGER NOT NULL,
     "sha256" TEXT NOT NULL,
     "conteudo" TEXT NOT NULL,
     "parserVersao" TEXT NOT NULL,
     "chaveNfe" TEXT,
     "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalAnexo_userId_sha256_key" ON "FiscalAnexo"("userId","sha256")`,
  `CREATE INDEX IF NOT EXISTS "FiscalAnexo_userId_criadoEm_idx" ON "FiscalAnexo"("userId","criadoEm")`,

  // ⚠ As FKs vão DEPOIS das tabelas, e cada uma num bloco próprio: `ADD CONSTRAINT` não tem
  // `IF NOT EXISTS` no Postgres, então a repetição é tratada como sucesso (42710 = já existe).
];

const fks = [
  [`FiscalTipiVersao`, `FiscalTipiVersao_arquivoId_fkey`, `FOREIGN KEY ("arquivoId") REFERENCES "FiscalFonteArquivo"("id")`],
  [`FiscalTipiLinha`, `FiscalTipiLinha_versaoId_fkey`, `FOREIGN KEY ("versaoId") REFERENCES "FiscalTipiVersao"("id") ON DELETE CASCADE`],
  [`FiscalNcmVersao`, `FiscalNcmVersao_arquivoId_fkey`, `FOREIGN KEY ("arquivoId") REFERENCES "FiscalFonteArquivo"("id")`],
  [`FiscalNcmCodigo`, `FiscalNcmCodigo_versaoId_fkey`, `FOREIGN KEY ("versaoId") REFERENCES "FiscalNcmVersao"("id") ON DELETE CASCADE`],
  [`FiscalNormaVersao`, `FiscalNormaVersao_normaId_fkey`, `FOREIGN KEY ("normaId") REFERENCES "FiscalNorma"("id") ON DELETE CASCADE`],
  [`FiscalDispositivo`, `FiscalDispositivo_versaoId_fkey`, `FOREIGN KEY ("versaoId") REFERENCES "FiscalNormaVersao"("id") ON DELETE CASCADE`],
  [`FiscalMensagem`, `FiscalMensagem_conversaId_fkey`, `FOREIGN KEY ("conversaId") REFERENCES "FiscalConversa"("id") ON DELETE CASCADE`],


];

try {
  for (const s of sql) await prisma.$executeRawUnsafe(s);
  for (const [tabela, nome, def] of fks) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tabela}" ADD CONSTRAINT "${nome}" ${def}`);
    } catch (e) {
      if (!/already exists|42710/i.test(e.message)) throw e;
    }
  }
  console.log("[Fiscal] Tabelas e índices da Inteligência Fiscal prontos.");
} catch (e) {
  console.error("[Fiscal] Não foi possível preparar as tabelas fiscais:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
