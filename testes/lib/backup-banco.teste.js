import { gunzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O BACKUP SEMANAL DO BANCO ESTAVA CHEGANDO NO TETO (24/09/2026): 192 → 236 → 234 → 249 s em quatro
// domingos, contra os 300 s da função. Ele passou a exportar quatro tabelas de cada vez, a comprimir
// página a página e a parar sozinho antes de a plataforma matá-lo.

// Um banco de mentira: cada modelo responde `findMany` paginado por id, como o Prisma.
const dados = {};
let emVoo = 0;
let picoEmVoo = 0;
let atrasoMs = 0;
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, {
    get: (_, acessor) => (typeof acessor !== "string" ? undefined : {
      findMany: async ({ take, cursor }) => {
        emVoo++; picoEmVoo = Math.max(picoEmVoo, emVoo);
        await new Promise((r) => setTimeout(r, atrasoMs));
        emVoo--;
        const linhas = dados[acessor] || [];
        const de = cursor ? linhas.findIndex((l) => l.id === cursor.id) + 1 : 0;
        return linhas.slice(de, de + take);
      },
    }),
  }),
}));
vi.mock("@/lib/sharepoint", () => ({ uploadFileToFolder: vi.fn() }));

const { rodarBackup, modelosDoBanco } = await import("@/lib/backup-banco");

let enviados;
const enviar = async (arq) => { enviados.push(arq); };
const linhasDe = (arq) => gunzipSync(arq.buffer).toString("utf8").trim().split("\n").map((l) => JSON.parse(l));

beforeEach(() => {
  for (const k of Object.keys(dados)) delete dados[k];
  enviados = [];
  emVoo = 0; picoEmVoo = 0; atrasoMs = 0;
});

describe("backup semanal do banco", () => {
  it("tabela de várias páginas sai inteira e na ordem, uma linha por registro", async () => {
    dados.auditLog = Array.from({ length: 4500 }, (_, i) => ({ id: `a${String(i).padStart(5, "0")}`, n: i }));
    const m = await rodarBackup({ dia: "2026-09-27", enviar });
    const arq = enviados.find((a) => a.fileName === "AuditLog.ndjson.gz");
    const linhas = linhasDe(arq);
    expect(linhas).toHaveLength(4500);
    expect(linhas[0]).toEqual({ id: "a00000", n: 0 });
    expect(linhas[4499]).toEqual({ id: "a04499", n: 4499 });
    expect(m.tabelas.find((t) => t.tabela === "AuditLog")).toMatchObject({ linhas: 4500, bytes: arq.buffer.length });
  });

  it("exporta até quatro tabelas ao mesmo tempo — nunca mais que isso", async () => {
    atrasoMs = 2;
    for (const m of modelosDoBanco().slice(0, 12)) dados[m.acessor] = [{ id: "1" }];
    await rodarBackup({ dia: "2026-09-27", enviar });
    expect(picoEmVoo).toBeGreaterThan(1);
    expect(picoEmVoo).toBeLessThanOrEqual(4);
  });

  it("o manifesto sobe por ÚLTIMO e lista as tabelas em ordem alfabética", async () => {
    atrasoMs = 1;
    for (const m of modelosDoBanco().slice(0, 8)) dados[m.acessor] = [{ id: "1" }];
    const m = await rodarBackup({ dia: "2026-09-27", enviar });
    expect(enviados.at(-1).fileName).toBe("manifesto.json");
    const nomes = m.tabelas.map((t) => t.tabela);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
    expect(m.falhas).toEqual([]);
  });

  it("perto do teto de tempo, para de começar tabela e diz no manifesto quais faltaram", async () => {
    for (const m of modelosDoBanco().slice(0, 6)) dados[m.acessor] = [{ id: "1" }];
    let t = 0;
    const agora = () => (t += 100_000); // cada leitura do relógio avança 100 s
    const m = await rodarBackup({ dia: "2026-09-27", enviar, agora, simultaneas: 1 });
    expect(m.falhas.length).toBeGreaterThan(0);
    expect(m.falhas.every((f) => /tempo esgotado/.test(f.erro))).toBe(true);
    // ainda assim o manifesto sobe — é o que faz o heartbeat sair vermelho no mesmo dia
    expect(enviados.at(-1).fileName).toBe("manifesto.json");
  });

  it("modelo que ainda não tem tabela no banco (P2021) não é falha — fica listado à parte", async () => {
    const [a, b] = modelosDoBanco();
    dados[a.acessor] = [{ id: "1" }];
    Object.defineProperty(dados, b.acessor, {
      get() { throw Object.assign(new Error(`The table public.${b.nome} does not exist`), { code: "P2021" }); },
      configurable: true,
    });
    const m = await rodarBackup({ dia: "2026-09-27", enviar });
    delete dados[b.acessor];
    expect(m.falhas).toEqual([]);
    expect(m.modelosSemTabela).toEqual([b.nome]);
  });

  it("uma tabela que falha não derruba as outras", async () => {
    const [a, b] = modelosDoBanco();
    dados[a.acessor] = [{ id: "1" }];
    Object.defineProperty(dados, b.acessor, { get() { throw new Error("conexão caiu"); }, configurable: true });
    const m = await rodarBackup({ dia: "2026-09-27", enviar });
    delete dados[b.acessor];
    expect(m.falhas).toEqual([{ tabela: b.nome, erro: "conexão caiu" }]);
    expect(m.tabelas.map((t) => t.tabela)).toContain(a.nome);
  });
});
