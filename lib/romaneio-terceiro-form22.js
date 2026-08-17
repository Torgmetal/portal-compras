// Gera o romaneio de TERCEIRO no MESMO modelo FORM 22 dos romaneios de obra (Vitor: "o romaneio
// vai ser o mesmo modelo que usamos hoje"), mas com o TERCEIRO como destinatário no cabeçalho e
// numeração própria RT-## — À PARTE dos romaneios de entrega ao cliente. Carrega o fornecedor
// (razão/CNPJ/cidade/contato) e a obra da OP referenciada pra preencher o cabeçalho.
import { prisma } from "./prisma";
import { gerarRomaneioForm22 } from "./romaneio-form22";

// opts.material = true → gera o 2º romaneio (MATERIAL a cortar, agrupado por perfil) em vez das peças.
export async function gerarRomaneioTerceiroForm22(rom, opts = {}) {
  const material = !!opts.material;
  const forn = rom.fornecedorId
    ? await prisma.fornecedor.findUnique({ where: { id: rom.fornecedorId } }).catch(() => null)
    : null;
  const op = rom.opRefId
    ? await prisma.oP.findUnique({ where: { id: rom.opRefId }, select: { obra: true } }).catch(() => null)
    : null;

  const rt = `RT-${String(rom.numero).padStart(3, "0")}`;
  // O bloco "cliente" do FORM 22 vira o DESTINATÁRIO = o terceiro.
  const paramsOp = {
    numero: rom.opRefNumero || "—",
    obra: material ? `MATERIAL p/ terceiro${rom.servico ? ` · ${rom.servico}` : ""}` : (op?.obra || (rom.servico ? `Terceiro · ${rom.servico}` : "Material em terceiro")),
    clienteRazaoSocial: forn?.razaoSocial || rom.terceiroNome,
    clienteCidade: forn?.cidade || null,
    clienteUF: forn?.uf || null,
    clienteCnpj: forn?.cnpj || null,
    clienteContato: forn?.contato || forn?.telefone || null,
    clienteEmail: forn?.email || null,
  };
  const romaneio = {
    numero: material ? `${rt}-MAT` : rt,
    data: rom.dataEnvio || rom.createdAt,
    transportadora: rom.transportadora,
    motorista: rom.motorista,
    placa: rom.placaVeiculo,
    placaCarreta: rom.placaCarreta,
    contatoTransporte: rom.contatoTransporte,
  };
  const itens = material
    ? (Array.isArray(rom.materiais) ? rom.materiais : []).map((m) => ({ marca: m.perfil, descricao: [m.unidade, m.descricao].filter(Boolean).join(" · ") || m.perfil || "", qtd: m.qtd ?? null, pesoKg: m.pesoKg ?? null }))
    : (Array.isArray(rom.itens) ? rom.itens : []).map((it) => ({ marca: it.marca, descricao: it.descricao || "", qtd: it.qte ?? null, pesoKg: it.pesoTotal != null ? it.pesoTotal : (Number(it.qte) || 0) * (Number(it.pesoUn) || 0) }));

  return gerarRomaneioForm22({ op: paramsOp, romaneio, itens });
}
