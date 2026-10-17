import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { documentoQualidade: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/sharepoint", () => ({ listChildrenByPath: vi.fn() }));
vi.mock("@/lib/projetos-databook", () => ({ resolveServidorDriveId: vi.fn() }));

import { procedimentoDoTipo } from "@/lib/importar-procedimentos";

describe("procedimento do ensaio por ultrassom", () => {
  beforeEach(() => mocks.findFirst.mockReset().mockResolvedValue(null));

  it("consulta o PI-QUA-003, e não o procedimento visual PO-06", async () => {
    await procedimentoDoTipo("ULTRASSOM");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ numeroDocumento: "PI-QUA-003", ativo: true }),
    }));
  });
});
