/**
 * create-mes-trigger.mjs
 *
 * Cria (ou recria) o event trigger PostgreSQL que impede DROP TABLE
 * nas tabelas MesApontamento e MesSyncLog.
 *
 * Rodar uma vez após setup inicial ou se o trigger for removido acidentalmente:
 *   node scripts/create-mes-trigger.mjs
 *
 * Requer conexão direta ao banco (não pooled).
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega .env.local
const envPath = join(__dirname, "../.env.local");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch (_) {}

const { Client } = require("pg");

const connStr =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;

if (!connStr) {
  console.error("ERRO: Nenhuma connection string encontrada no .env.local");
  process.exit(1);
}

const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log("Conectado ao banco.");

  // Cria função de proteção
  await client.query(`
    CREATE OR REPLACE FUNCTION protect_mes_tables()
    RETURNS event_trigger LANGUAGE plpgsql AS $BODY$
    DECLARE
      obj record;
    BEGIN
      FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
      LOOP
        IF obj.object_type = 'table'
           AND obj.schema_name = 'public'
           AND obj.object_name IN ('MesApontamento', 'MesSyncLog')
        THEN
          RAISE EXCEPTION
            'PROTECAO MES: A tabela "%" contem dados de producao sincronizados e NAO pode ser removida. '
            'Contate o administrador do sistema.',
            obj.object_name;
        END IF;
      END LOOP;
    END;
    $BODY$
  `);
  console.log("Função protect_mes_tables criada/atualizada.");

  await client.query(`DROP EVENT TRIGGER IF EXISTS protect_mes_tables_trigger`);
  await client.query(`
    CREATE EVENT TRIGGER protect_mes_tables_trigger
      ON sql_drop
      EXECUTE FUNCTION protect_mes_tables()
  `);
  console.log("Event trigger protect_mes_tables_trigger criado.");

  const res = await client.query(`
    SELECT evtname, evtevent, evtenabled FROM pg_event_trigger
    WHERE evtname = 'protect_mes_tables_trigger'
  `);
  console.log("Status:", JSON.stringify(res.rows));
  console.log("\nTabelas MES agora estao protegidas contra DROP TABLE.");

  await client.end();
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
