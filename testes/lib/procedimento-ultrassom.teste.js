import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { documentoQualidade: { findMany: mocks.findMany } } }));
vi.mock("@/lib/sharepoint", () => ({ listChildrenByPath: vi.fn() }));
vi.mock("@/lib/projetos-databook", () => ({ resolveServidorDriveId: vi.fn() }));

import { procedimentoDoTipo } from "@/lib/importar-procedimentos";

describe("procedimento do ensaio por ultrassom", () => {
  beforeEach(() => mocks.findMany.mockReset().mockResolvedValue([]));

  it("consulta o PI-QUA-003, e não o procedimento visual PO-06", async () => {
    await procedimentoDoTipo("ULTRASSOM");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ numeroDocumento: "PI-QUA-003", ativo: true }),
    }));
  });
});
