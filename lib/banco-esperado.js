import "server-only";
import { Prisma } from "@prisma/client";

// ─── O QUE O CÓDIGO ESPERA DO BANCO, CONFERIDO SOZINHO ───────────────────────────────────────
//
// ⚠⚠ POR QUE VARRER EM VEZ DE LISTAR À MÃO. Vitor (04/09/2026): "essa varredura desses problemas
// será sempre que você mandar pra lá ou terá alguma coisa que vai varrer sozinho?". Coluna que o
// código usa e o banco não tem foi o que travou duas correções neste dia — e cada uma virou uma
// tarefa escrita à mão, que só existe porque EU lembrei de escrever. Esquecer uma é derrubar a
// tela em produção com "column does not exist".
//
// Aqui a lista sai do próprio modelo do Prisma (`Prisma.dmmf`), que é o mesmo que gera o cliente
// que faz as consultas: se o código sabe pedir a coluna, esta varredura sabe cobrá-la.
//
// ⚠ SÓ ADITIVO, e nem tudo. Entra o que dá para criar sem tocar em dado nenhum: coluna NOVA e
// OPCIONAL. Fica de fora — e é REPORTADO para alguém olhar — o que exigiria decisão:
//   · tabela inteira faltando (é migração, não remendo);
//   · coluna obrigatória (precisa de valor para as linhas que já existem);
//   · lista, enum e tipo que eu não saiba traduzir com segurança.
// Nada aqui apaga coluna a mais no banco: coluna sobrando não quebra nada e apagá-la apaga dado.

/** Tipo do Prisma → tipo do Postgres. O que não está aqui não é criado automaticamente. */
const TIPO_SQL = {
  String: "TEXT",
  Boolean: "BOOLEAN",
  Int: "INTEGER",
  BigInt: "BIGINT",
  Float: "DOUBLE PRECISION",
  Decimal: "DECIMAL(65,30)",
  Json: "JSONB",
  Bytes: "BYTEA",
  DateTime: "TIMESTAMP(3)",
};

/** `@db.Date` é DATE, não TIMESTAMP — e a diferença aqui é a armadilha de fuso de sempre. */
function tipoSql(campo) {
  const nativo = Array.isArray(campo.nativeType) ? String(campo.nativeType[0] || "") : "";
  if (campo.type === "DateTime" && /^date$/i.test(nativo)) return "DATE";
  if (campo.type === "String" && /^(VarChar|Char)$/i.test(nativo)) return "TEXT";
  return TIPO_SQL[campo.type] || null;
}

/**
 * Compara o modelo do Prisma com o que existe no banco.
 *
 * @returns {Promise<{criaveis: Array, revisar: Array}>}
 *   `criaveis` = colunas novas e opcionais, com o SQL pronto; `revisar` = o que precisa de gente.
 */
export async function conferirBanco(prisma) {
  const modelos = Prisma.dmmf?.datamodel?.models || [];
  const tabelas = modelos.map((m) => m.dbName || m.name);

  const linhas = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    tabelas,
  );
  const existentes = new Map(); // tabela → Set(colunas)
  for (const l of linhas) {
    if (!existentes.has(l.table_name)) existentes.set(l.table_name, new Set());
    existentes.get(l.table_name).add(l.column_name);
  }

  const criaveis = [], revisar = [];
  for (const m of modelos) {
    const tabela = m.dbName || m.name;
    const cols = existentes.get(tabela);
    if (!cols) {
      // ⚠ tabela inteira faltando é migração, não remendo — e criar tabela às cegas a partir do
      // modelo erraria índices, chaves e relações.
      revisar.push({ tabela, coluna: null, motivo: "a tabela não existe no banco" });
      continue;
    }
    for (const campo of m.fields) {
      if (campo.kind !== "scalar" || campo.isGenerated) continue;
      const coluna = campo.dbName || campo.name;
      if (cols.has(coluna)) continue;
      if (campo.isList) { revisar.push({ tabela, coluna, motivo: "campo lista" }); continue; }
      if (campo.isRequired && !campo.hasDefaultValue) {
        revisar.push({ tabela, coluna, motivo: "coluna obrigatória — as linhas que já existem precisam de um valor" });
        continue;
      }
      const tipo = tipoSql(campo);
      if (!tipo) { revisar.push({ tabela, coluna, motivo: `tipo ${campo.type} não é criado automaticamente` }); continue; }
      // ⚠ obrigatória COM default até dá para criar, mas exige o default no ALTER e um retrato das
      // linhas antigas — deixo para quem conhece o dado.
      if (campo.isRequired) {
        revisar.push({ tabela, coluna, motivo: "obrigatória com valor padrão — confira o retrato das linhas antigas" });
        continue;
      }
      criaveis.push({
        tabela, coluna, tipo,
        sql: `ALTER TABLE "${tabela}" ADD COLUMN IF NOT EXISTS "${coluna}" ${tipo}`,
      });
    }
  }
  return { criaveis, revisar };
}
