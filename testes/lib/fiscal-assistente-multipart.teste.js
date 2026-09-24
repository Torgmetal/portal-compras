import { describe, it, expect } from "vitest";
import { lerMultipart, CorpoRecusado, TETO_CORPO } from "@/lib/fiscal/assistente/multipart";
import { nfe } from "@/testes/apoio/nfe-exemplo";

// ⚠⚠⚠ `req.formData()` MATERIALIZA O CORPO INTEIRO ANTES DE QUALQUER CONFERÊNCIA — e a aba Auditoria
// faz exatamente isso (parecer de segurança do Codex, 24/09/2026). Estes testes provam que aqui o
// teto é contado BYTE A BYTE, e que a lista de campos é fechada.

const formulario = (partes) => {
  const f = new FormData();
  for (const [nome, valor, arquivo] of partes) {
    if (arquivo) f.append(nome, new Blob([valor], { type: "text/xml" }), arquivo);
    else f.append(nome, valor);
  }
  return f;
};
const pedido = (f, headers = {}) => new Request("http://x/", { method: "POST", body: f, headers });

const recusa = async (p) => {
  try { await lerMultipart(p); } catch (e) { return e; }
  return null;
};

describe("o teto é de bytes, e é contado enquanto chega", () => {
  it("Content-Length acima do teto é recusado de saída, com 413", async () => {
    const r = new Request("http://x/", { method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=a", "content-length": String(TETO_CORPO + 1) } });
    const e = await recusa(r);
    expect(e).toBeInstanceOf(CorpoRecusado);
    expect(e.status).toBe(413);
  });

  // ⚠⚠ O CABEÇALHO PODE MENTIR OU FALTAR (corpo em chunks). A defesa é a contagem.
  it("corpo SEM Content-Length acima do teto é cortado na leitura, com 413", async () => {
    const pedaco = new Uint8Array(1024 * 1024);
    let enviados = 0;
    const fluxo = new ReadableStream({
      pull(c) { if (enviados++ < 10) c.enqueue(pedaco); else c.close(); },
    });
    const r = new Request("http://x/", { method: "POST", body: fluxo, duplex: "half", headers: { "content-type": "multipart/form-data; boundary=a" } });
    const e = await recusa(r);
    expect(e?.status).toBe(413);
    // ⚠ Parou de puxar antes do fim: não leu os 10 MB inteiros para só então recusar.
    expect(enviados).toBeLessThan(10);
  });
});

describe("a lista de campos é fechada", () => {
  it("aceita pergunta + chave + um XML", async () => {
    const r = await lerMultipart(pedido(formulario([["pergunta", "qual CFOP?"], ["chave", "chave-123456"], ["xml", nfe(), "nota.xml"]])));
    expect(r.campos.pergunta).toBe("qual CFOP?");
    expect(r.arquivo.nome).toBe("nota.xml");
    expect(r.arquivo.texto).toContain("<infNFe");
  });

  it("dois arquivos são recusados — o segundo escaparia de toda a validação do primeiro", async () => {
    const e = await recusa(pedido(formulario([["pergunta", "x"], ["xml", nfe(), "a.xml"], ["xml", nfe(), "b.xml"]])));
    expect(e?.message).toMatch(/UM arquivo/);
  });

  it("campo desconhecido é recusado, não ignorado", async () => {
    const e = await recusa(pedido(formulario([["pergunta", "x"], ["modelo", "claude-opus"]])));
    expect(e?.message).toMatch(/Campo não esperado/);
  });

  it("campo de texto repetido é recusado", async () => {
    const e = await recusa(pedido(formulario([["pergunta", "a"], ["pergunta", "b"]])));
    expect(e?.message).toMatch(/repetido/);
  });

  it("`xml` enviado como texto, não como arquivo, é recusado", async () => {
    const e = await recusa(pedido(formulario([["pergunta", "x"], ["xml", nfe()]])));
    expect(e?.message).toMatch(/precisa ser um arquivo/);
  });
});
