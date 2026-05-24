/**
 * Script de importação em massa dos orçamentos para o CRM do Omie.
 *
 * Cria: contas (49 clientes), contatos (1 por conta) e oportunidades (150).
 *
 * Uso: OMIE_APP_KEY=... OMIE_APP_SECRET=... node scripts/importar-omie-crm.js
 */

const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch");

const prisma = new PrismaClient();

const APP_KEY = process.env.OMIE_APP_KEY;
const APP_SECRET = process.env.OMIE_APP_SECRET;

if (!APP_KEY || !APP_SECRET) {
  console.error("❌ Defina OMIE_APP_KEY e OMIE_APP_SECRET");
  process.exit(1);
}

// ── Mapeamentos ────────────────────────────────────────────────

const VENDEDORES = {
  "Vitor":          7320753294,
  "Patrícia":       7708680334,
  "Matheus":        7353302112,
  "André Metzker":  7320753294, // fallback → Vitor Costa
  "Jorge":          7320753294, // fallback → Vitor Costa
};

const FASES = {
  ORCAMENTO:      7315778107,
  EM_NEGOCIACAO:  7315778108,
  FECHADA:        7315778108,
  PERDIDA:        7315778107,
};

const STATUS_MAP = {
  ORCAMENTO:      7315778140, // Ativo
  EM_NEGOCIACAO:  7315778140, // Ativo
  FECHADA:        7315778144, // Conquistado
  PERDIDA:        7315778142, // Perdido
};

const SOLUCAO_MAP = {
  FABRICACAO:              7783978857, // 001
  FABRICACAO_E_MONTAGEM:   7783978857, // 001
  MONTAGEM:                7783979408, // 005
  MAO_DE_OBRA:             7783979408, // 005
  PINTURA:                 7783979477, // 009
  REVENDA:                 7783978857, // 001 (fallback)
};

const ORIGEM_ATIVO = 7315778122;
const SOLUCAO_DEFAULT = 7783978857;
const VENDEDOR_DEFAULT = 7320753294; // Vitor Costa

// ── Helpers ────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(str) {
  return str
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase()
    .slice(0, 50);
}

async function omieCall(endpoint, call, param) {
  const res = await fetch(`https://app.omie.com.br/api/v1/crm/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: APP_KEY, app_secret: APP_SECRET, param: [param] }),
  });
  return res.json();
}

// ── Criação de Contas ──────────────────────────────────────────

async function criarConta(cliente) {
  const codInt = `TORG_${slugify(cliente)}`;
  const result = await omieCall("contas", "UpsertConta", {
    identificacao: { cNome: cliente, cCodInt: codInt },
    endereco: { cBairro: "", cCEP: "", cCidade: "", cCompl: "", cEndereco: "", cPais: "", cUF: "" },
    telefone_email: { cDDDTel: "", cNumTel: "", cEmail: "", cWebsite: "", cDDDFax: "", cNumFax: "" },
  });

  if (result.faultstring) {
    // Se já existe, tentar buscar pelo codInt
    if (result.faultstring.includes("já cadastrad")) {
      console.log(`  ↺ Conta "${cliente}" já existe, buscando...`);
      return await buscarContaPorCodInt(codInt);
    }
    throw new Error(`Conta "${cliente}": ${result.faultstring}`);
  }

  return { nCod: result.nCod, cCodInt: codInt };
}

async function buscarContaPorCodInt(codInt) {
  const result = await omieCall("contas", "ConsultarConta", {
    identificacao: { cCodInt: codInt },
  });
  if (result.faultstring) {
    throw new Error(`ConsultarConta ${codInt}: ${result.faultstring}`);
  }
  return { nCod: result.identificacao.nCod, cCodInt: codInt };
}

// ── Criação de Contatos ────────────────────────────────────────

async function criarContato(cliente, nCodConta) {
  const codInt = `TORG_CONT_${slugify(cliente)}`;
  const result = await omieCall("contatos", "UpsertContato", {
    identificacao: { cCodInt: codInt, cNome: "Contato", cSobrenome: cliente, nCodConta },
    endereco: { cEndereco: "", cCEP: "", cBairro: "", cCidade: "", cUF: "", cPais: "", cCompl: "" },
    telefone_email: { cEmail: "", cDDDTel: "", cNumTel: "", cDDDCel1: "", cNumCel1: "" },
  });

  if (result.faultstring) {
    if (result.faultstring.includes("já cadastrad")) {
      console.log(`  ↺ Contato "${cliente}" já existe, buscando...`);
      return await buscarContatoPorCodInt(codInt);
    }
    throw new Error(`Contato "${cliente}": ${result.faultstring}`);
  }

  return { nCod: result.nCod, cCodInt: codInt };
}

async function buscarContatoPorCodInt(codInt) {
  const result = await omieCall("contatos", "ConsultarContato", {
    identificacao: { cCodInt: codInt },
  });
  if (result.faultstring) {
    throw new Error(`ConsultarContato ${codInt}: ${result.faultstring}`);
  }
  return { nCod: result.identificacao.nCod, cCodInt: codInt };
}

// ── Criação de Oportunidades ───────────────────────────────────

async function criarOportunidade(orc, nCodConta, nCodContato) {
  const codIntOp = `TORG_ORC_${orc.numero}`;
  const descricao = `${orc.numero} - ${orc.cliente}${orc.obra ? " - " + orc.obra : ""}`.slice(0, 100);

  const nCodVendedor = VENDEDORES[orc.vendedor] || VENDEDOR_DEFAULT;
  const nCodFase = FASES[orc.status] || FASES.ORCAMENTO;
  const nCodStatus = STATUS_MAP[orc.status] || STATUS_MAP.ORCAMENTO;
  const nCodSolucao = SOLUCAO_MAP[orc.tipoVenda] || SOLUCAO_DEFAULT;

  // Valor: se tipoVenda for serviço, vai em nServicos; senão nProdutos
  const isServico = ["MAO_DE_OBRA", "MONTAGEM"].includes(orc.tipoVenda);
  const valor = orc.valor ? Number(orc.valor) : 0;

  // Observações
  const partes = [];
  if (orc.tipoVenda) partes.push(`Tipo: ${orc.tipoVenda.replace(/_/g, " ")}`);
  if (orc.porte) partes.push(`Porte: ${orc.porte.replace(/_/g, " ")}`);
  if (orc.responsavel) partes.push(`Resp: ${orc.responsavel}`);
  if (orc.motivoPerda) partes.push(`Motivo perda: ${orc.motivoPerda}`);
  if (orc.observacoes) partes.push(orc.observacoes);
  partes.push("Importado do Portal Torg");

  const param = {
    identificacao: {
      cDesOp: descricao,
      cCodIntOp: codIntOp,
      nCodConta,
      nCodContato,
      nCodOrigem: ORIGEM_ATIVO,
      nCodSolucao,
      nCodVendedor,
    },
    fasesStatus: { nCodFase, nCodStatus },
    ticket: {
      nProdutos: isServico ? 0 : valor,
      nServicos: isServico ? valor : 0,
    },
    previsaoTemp: {},
    observacoes: { cObs: partes.join(" | ") },
    outrasInf: {},
    envolvidos: {},
  };

  const result = await omieCall("oportunidades", "UpsertOportunidade", param);

  if (result.faultstring) {
    throw new Error(`Oportunidade ${orc.numero}: ${result.faultstring}`);
  }

  return result;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Importação Omie CRM — início\n");

  // 1) Buscar todos os orçamentos
  const orcamentos = await prisma.orcamento.findMany({
    orderBy: { numero: "asc" },
  });
  console.log(`📋 ${orcamentos.length} orçamentos no banco\n`);

  // 2) Clientes únicos
  const clientesUnicos = [...new Set(orcamentos.map((o) => o.cliente))].sort();
  console.log(`👥 ${clientesUnicos.length} clientes únicos\n`);

  // 3) Criar contas + contatos
  const contaMap = {}; // cliente -> { nCodConta, nCodContato }
  let contasCriadas = 0;
  let contasErro = 0;

  console.log("── Criando Contas e Contatos ──\n");

  for (const cliente of clientesUnicos) {
    try {
      // Criar conta
      const conta = await criarConta(cliente);
      await sleep(400);

      // Criar contato
      const contato = await criarContato(cliente, conta.nCod);
      await sleep(400);

      contaMap[cliente] = { nCodConta: conta.nCod, nCodContato: contato.nCod };
      contasCriadas++;
      console.log(`  ✅ ${contasCriadas}/${clientesUnicos.length} — ${cliente} (conta: ${conta.nCod}, contato: ${contato.nCod})`);
    } catch (err) {
      contasErro++;
      console.error(`  ❌ ${cliente}: ${err.message}`);
    }
  }

  console.log(`\n📊 Contas: ${contasCriadas} criadas, ${contasErro} erros\n`);

  // 4) Criar oportunidades
  console.log("── Criando Oportunidades ──\n");

  let opsCriadas = 0;
  let opsErro = 0;
  const erros = [];

  for (let i = 0; i < orcamentos.length; i++) {
    const orc = orcamentos[i];
    const ref = contaMap[orc.cliente];

    if (!ref) {
      console.error(`  ⚠️  ${orc.numero} — conta "${orc.cliente}" não encontrada, pulando`);
      opsErro++;
      erros.push({ numero: orc.numero, erro: "conta não criada" });
      continue;
    }

    try {
      const result = await criarOportunidade(orc, ref.nCodConta, ref.nCodContato);
      opsCriadas++;
      console.log(`  ✅ ${opsCriadas}/${orcamentos.length} — ${orc.numero} (nCodOp: ${result.nCodOp})`);
      await sleep(400);
    } catch (err) {
      opsErro++;
      erros.push({ numero: orc.numero, erro: err.message });
      console.error(`  ❌ ${orc.numero}: ${err.message}`);
      await sleep(400);
    }
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`📊 RESULTADO FINAL`);
  console.log(`══════════════════════════════════════`);
  console.log(`Contas:         ${contasCriadas}/${clientesUnicos.length}`);
  console.log(`Oportunidades:  ${opsCriadas}/${orcamentos.length}`);
  console.log(`Erros:          ${erros.length}`);
  if (erros.length > 0) {
    console.log(`\nErros detalhados:`);
    erros.forEach((e) => console.log(`  - ${e.numero}: ${e.erro}`));
  }
  console.log(`══════════════════════════════════════\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  prisma.$disconnect();
  process.exit(1);
});
