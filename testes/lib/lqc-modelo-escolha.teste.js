import { describe, it, expect } from "vitest";
import { escolherModelo } from "@/lib/lqc-planilha";

// ⚠⚠ A REGRA MUDOU EM 26/09/2026. Antes ficava a cópia MAIS RECENTE do modelo, e existem quatro
// no servidor — três delas dentro da pasta de uma obra de verdade (TAKRAF, MEGASTEAM, TESTE).
// Bastava alguém mexer numa para o portal passar a exportar em cima da planilha daquela obra.
// Só dá para distinguir porque a varredura por pasta traz o CAMINHO; a busca do Graph não trazia.

const MODELO = "LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx";
const a = (caminho, modificado, nome = MODELO) => ({ id: caminho, nome, caminho, modificado });
const RAIZ = "/Comercial/1. Orçamento/ORÇAMENTOS_2026";

describe("escolherModelo", () => {
  it("⚠⚠ a da pasta do modelo vence uma cópia MAIS NOVA dentro da pasta de uma obra", () => {
    const r = escolherModelo([
      a(`${RAIZ}/2. Concluidos/117-26-TAKRAF-PACOTE-2/5.Estudos`, "2026-09-25T10:00:00Z"),
      a(`${RAIZ}/1. Solicitados/000-26-CLIENTE-OBRA/5.Estudos`, "2026-05-01T10:00:00Z"),
    ]);
    expect(r.escolhido.caminho).toContain("000-26-CLIENTE-OBRA");
    expect(r.total).toBe(2);
    expect(r.fora).toBe(false);
  });

  it("⚠ sem nenhuma na pasta do modelo, volta a mais recente — e AVISA", () => {
    // Exportar com uma cópia é ruim; não exportar é pior. O aviso é o que separa os dois.
    const r = escolherModelo([
      a(`${RAIZ}/2. Concluidos/117-26-TAKRAF-PACOTE-2/5.Estudos`, "2026-09-20T10:00:00Z"),
      a(`${RAIZ}/1. Solicitados/291-26-TESTE-TESTE/5.Estudos`, "2026-09-25T10:00:00Z"),
    ]);
    expect(r.escolhido.caminho).toContain("291-26-TESTE-TESTE");
    expect(r.fora).toBe(true);
  });

  it("orçamento que só COMEÇA com zero não é a pasta do modelo", () => {
    // "001-26-DANPOWER" é uma obra de verdade; só o número todo-zero é a pasta do modelo.
    const r = escolherModelo([a(`${RAIZ}/2. Concluidos/001-26-DANPOWER-0325/5.Estudos`, "2026-09-01T00:00:00Z")]);
    expect(r.fora).toBe(true);
  });

  it("outro arquivo LQC não é o modelo; sem candidata, null", () => {
    expect(escolherModelo([a(`${RAIZ}/x`, "2026-09-01", "LQC-250-26-MARKO-TORG-R00.xlsx")])).toBeNull();
    expect(escolherModelo([])).toBeNull();
    expect(escolherModelo(null)).toBeNull();
  });
});
