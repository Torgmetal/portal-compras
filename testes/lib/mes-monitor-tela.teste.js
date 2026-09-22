import { describe, it, expect } from "vitest";
import { decorrido } from "@/app/mes-lab/monitor/decorrido";
import { proximoPasso, PASSO_MS } from "@/app/mes-lab/monitor/passo";

// O QUE A TELA DO MONITOR CALCULA SOZINHA — o relógio e o ritmo de atualização.

const agora = new Date("2026-09-13T13:00:00Z").getTime();
const atras = (min) => new Date(agora - min * 60_000);

describe("decorrido — o tempo é contado no navegador", () => {
  it("minutos, enquanto forem minutos", () => {
    expect(decorrido(atras(12), agora)).toBe("12 min");
    expect(decorrido(atras(59), agora)).toBe("59 min");
  });

  it("vira hora com os minutos junto", () => {
    expect(decorrido(atras(95), agora)).toBe("1h 35");
  });

  // ⚠ "1.487 min" ou "24 h" não dizem nada a quem olha de passagem; o que interessa é que aquilo
  // está assim DESDE ONTEM — e é justamente o caso da sessão que ninguém encerrou.
  it("acima de um dia, fala em dias", () => {
    expect(decorrido(atras(60 * 26), agora)).toBe("1 dia");
    expect(decorrido(atras(60 * 50), agora)).toBe("2 dias");
  });

  // ⚠ Posto sem registro não tem "desde", e "0 min" ali seria mentira com cara de precisão.
  it("sem instante, não inventa número", () => {
    expect(decorrido(null, agora)).toBe("—");
  });

  // ⚠ O relógio da TV pode estar adiantado em relação ao servidor: "-3 min" assusta à toa.
  it("instante no futuro não vira número negativo", () => {
    expect(decorrido(new Date(agora + 60_000), agora)).toBe("—");
  });
});

describe("proximoPasso — o recuo quando a atualização falha", () => {
  it("em dia, o passo é o normal", () => {
    expect(proximoPasso(0)).toBe(PASSO_MS);
  });

  // ⚠⚠ Sem recuo, a TV que perde a rede às 19h bate na porta a cada 10 s até de manhã — e quando o
  // servidor é a causa da falha, isso é bater em quem já está caído.
  it("dobra a cada erro e para de crescer em 2 min", () => {
    expect(proximoPasso(1)).toBe(20_000);
    expect(proximoPasso(3)).toBe(80_000);
    expect(proximoPasso(9)).toBe(120_000);
  });
});
