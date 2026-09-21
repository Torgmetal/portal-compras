import { describe, expect, it } from "vitest";
import { fonteDePit } from "@/lib/pit-pdf-fonte";

describe("fonteDePit", () => {
  it("reconhece somente o PDF virtual do PIT da mesma OP", () => {
    expect(fonteDePit({
      origem: "pit_portal", opNumero: "102",
      arquivoUrl: "/api/qualidade/planos/102/pdf?doc=PIT",
    })).toEqual({ opNumero: "102" });

    expect(fonteDePit({
      origem: "pit_portal", opNumero: "102",
      arquivoUrl: "/api/qualidade/planos/103/pdf?doc=PIT",
    })).toBeNull();
    expect(fonteDePit({
      origem: "registro_manual", opNumero: "102",
      arquivoUrl: "/api/qualidade/planos/102/pdf?doc=PIT",
    })).toBeNull();
    expect(fonteDePit({
      origem: "pit_portal", opNumero: "102",
      arquivoUrl: "/api/qualidade/planos/102/pdf?doc=PLP",
    })).toBeNull();
  });
});
