"use client";

// Layout da planilha Omie_Pedido_Compra (confirmado no template v1.1.3):
//  Row 7  — Dados da Compra: C=Cód.Integração, D=Fornecedor, E=Previsão,
//           F=Categoria, G=Parcelas, H=Comprador, I=Projeto, J=Conta Corrente,
//           K=Nº Pedido Forn., L=Contato, M=Obs. Pedido, N=Obs. Interna
//  Row 12 — Frete (opcional, deixamos em branco)
//  Row 17+ — Itens: D=Produto, E=Local de Estoque, F=Qtd, G=Preço Unit., P=Obs.

function hojeDDMMYYYY() {
  const d = new Date();
  return (
    String(d.getDate()).padStart(2, "0") +
    "/" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "/" +
    d.getFullYear()
  );
}

function sanitizeFilename(name) {
  return String(name || "fornecedor")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function gerarPlanilhasOmie({
  rm,
  pedidosPorFornecedor,
  fornecedores,
  categoriaCompra,
  localEstoque,
}) {
  if (!rm) throw new Error("RM inválida");
  if (!categoriaCompra || !categoriaCompra.trim())
    throw new Error("Informe a Categoria de Compra");
  if (!localEstoque || !localEstoque.trim())
    throw new Error("Informe o Local de Estoque");

  const nomes = Object.keys(pedidosPorFornecedor || {});
  if (nomes.length === 0) throw new Error("Nenhum fornecedor vencedor no mapa");

  const XLSX = await import("xlsx");
  const resp = await fetch("/omie-template.xlsx", { cache: "no-store" });
  if (!resp.ok) throw new Error("Não foi possível carregar o template Omie");
  const templateBuffer = await resp.arrayBuffer();

  const dataPrevisao = hojeDDMMYYYY();
  const arquivosGerados = [];

  for (const nomeFornecedor of nomes) {
    const group = pedidosPorFornecedor[nomeFornecedor];
    if (!group?.itens?.length) continue;

    const wb = XLSX.read(templateBuffer, { type: "array", cellFormula: false });
    const ws = wb.Sheets["Omie_Pedido_Compra"];
    if (!ws) throw new Error("Aba 'Omie_Pedido_Compra' não encontrada no template");

    const fornCadastro = (fornecedores || []).find(
      (f) =>
        f.nome &&
        f.nome.toLowerCase().trim() === nomeFornecedor.toLowerCase().trim()
    );

    const fornecedorIdent =
      fornCadastro?.cnpj?.trim() ||
      fornCadastro?.nome?.trim() ||
      nomeFornecedor;
    const parcelas = Number(fornCadastro?.parcelas) || 1;
    const contato = fornCadastro?.contato || "";
    const projeto = rm.op ? `OP-${rm.op}` : rm.rmTekla || "";
    const codIntegracao = `PC-RM${rm.numero || ""}-${sanitizeFilename(nomeFornecedor).slice(0, 10)}-${Date.now()}`.slice(0, 20);
    const obsPedido = rm.observacao || "";
    const obsInterna = `Portal de Compras — RM-${rm.numero || "?"} — Fornecedor: ${nomeFornecedor}`;

    // ─── Row 7: Dados da Compra ───
    ws["C7"] = { t: "s", v: codIntegracao };
    ws["D7"] = { t: "s", v: fornecedorIdent };
    ws["E7"] = { t: "s", v: dataPrevisao };
    ws["F7"] = { t: "s", v: categoriaCompra.trim() };
    ws["G7"] = { t: "n", v: parcelas };
    ws["I7"] = { t: "s", v: projeto };
    ws["J7"] = { t: "s", v: "Inter" };
    if (contato) ws["L7"] = { t: "s", v: contato };
    if (obsPedido) ws["M7"] = { t: "s", v: obsPedido };
    ws["N7"] = { t: "s", v: obsInterna };

    // ─── Row 17+: Itens ───
    group.itens.forEach((it, idx) => {
      const r = 17 + idx;
      const produto = (it.codigo && String(it.codigo).trim()) || it.descricao || it.item || "";
      ws[`D${r}`] = { t: "s", v: String(produto) };
      ws[`E${r}`] = { t: "s", v: localEstoque.trim() };
      ws[`F${r}`] = { t: "n", v: Number(it.qtd) || 0 };
      ws[`G${r}`] = { t: "n", v: Number(it.precoUnit) || 0 };
      if (it.condicao || it.prazoEntrega) {
        const obsItem = [it.condicao, it.prazoEntrega].filter(Boolean).join(" — ");
        if (obsItem) ws[`P${r}`] = { t: "s", v: obsItem };
      }
    });

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const filename = `Omie_RM-${rm.numero || "000"}_${sanitizeFilename(nomeFornecedor)}.xlsx`;
    triggerDownload(blob, filename);
    arquivosGerados.push(filename);

    // Pequena pausa para evitar bloqueio do navegador em downloads múltiplos
    await new Promise((r) => setTimeout(r, 350));
  }

  return arquivosGerados;
}
