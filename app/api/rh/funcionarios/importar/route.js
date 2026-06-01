// POST /api/rh/funcionarios/importar — importa funcionários de planilha Excel
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import * as XLSX from "xlsx";

export const maxDuration = 60;

// Normaliza texto para comparação
const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Tenta parsear data em vários formatos
function parseData(val) {
  if (!val) return null;
  // Excel serial number
  if (typeof val === "number") {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + val * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  // dd/mm/yyyy ou dd-mm-yyyy
  const brMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const d = new Date(`${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`);
    return isNaN(d.getTime()) ? null : d;
  }
  // yyyy-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const CONTRATO_MAP = {
  clt: "CLT",
  pj: "PJ",
  estagio: "ESTAGIO",
  estágio: "ESTAGIO",
  "jovem aprendiz": "JOVEM_APRENDIZ",
  temporario: "TEMPORARIO",
  temporário: "TEMPORARIO",
};

const TURNO_MAP = {
  administrativo: "ADMINISTRATIVO",
  adm: "ADMINISTRATIVO",
  "producao 1": "PRODUCAO_1",
  "produção 1": "PRODUCAO_1",
  "1o turno": "PRODUCAO_1",
  "producao 2": "PRODUCAO_2",
  "produção 2": "PRODUCAO_2",
  "2o turno": "PRODUCAO_2",
  noturno: "NOTURNO",
};

export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ success: false, error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });

    // Usa a primeira aba
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return NextResponse.json({ success: false, error: "Planilha vazia" }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhuma linha de dados encontrada" }, { status: 400 });
    }

    // Mapear cabeçalhos flexíveis
    const mapHeader = (row) => {
      const keys = Object.keys(row);
      const find = (...terms) => {
        for (const t of terms) {
          const k = keys.find((k) => norm(k).includes(norm(t)));
          if (k) return row[k];
        }
        return "";
      };
      return {
        nome: find("nome"),
        cpf: find("cpf"),
        rg: find("rg"),
        dataNascimento: find("nascimento", "data nasc"),
        email: find("email", "e-mail"),
        telefone: find("telefone", "celular", "fone"),
        endereco: find("endereco", "endereço"),
        cidadeUF: find("cidade", "cidade/uf"),
        matricula: find("matricula", "matrícula"),
        dataAdmissao: find("admissao", "admissão", "data admissão"),
        setor: find("setor", "departamento"),
        cargo: find("cargo", "função", "funcao"),
        salario: find("salario", "salário"),
        tipoContrato: find("contrato", "tipo contrato", "vinculo", "vínculo"),
        jornadaHoras: find("jornada", "horas"),
        turno: find("turno"),
        observacao: find("observacao", "observação", "obs"),
      };
    };

    // Cache de setores e cargos existentes
    const setoresExistentes = await prisma.setor.findMany({ where: { ativo: true } });
    const cargosExistentes = await prisma.cargo.findMany({ where: { ativo: true } });
    const setorCache = new Map(setoresExistentes.map((s) => [norm(s.nome), s]));
    const cargoCache = new Map(cargosExistentes.map((c) => [norm(c.nome), c]));

    // Processar cada linha
    const resultados = [];
    let criados = 0;
    let erros = 0;
    let setoresCriados = 0;
    let cargosCriados = 0;

    for (let i = 0; i < rows.length; i++) {
      const lineNum = i + 2; // +2 porque Excel é 1-based e tem header
      const raw = mapHeader(rows[i]);

      // Validação mínima
      const nome = String(raw.nome).trim();
      if (!nome) {
        resultados.push({ linha: lineNum, erro: "Nome vazio — linha ignorada" });
        erros++;
        continue;
      }

      const dataAdmissao = parseData(raw.dataAdmissao);
      if (!dataAdmissao) {
        resultados.push({ linha: lineNum, nome, erro: "Data de admissão inválida ou vazia" });
        erros++;
        continue;
      }

      // Resolver setor (cria se não existe)
      const setorNome = String(raw.setor).trim();
      let setorId;
      if (!setorNome) {
        resultados.push({ linha: lineNum, nome, erro: "Setor vazio" });
        erros++;
        continue;
      }
      if (setorCache.has(norm(setorNome))) {
        setorId = setorCache.get(norm(setorNome)).id;
      } else {
        const novoSetor = await prisma.setor.create({ data: { nome: setorNome } });
        setorCache.set(norm(setorNome), novoSetor);
        setorId = novoSetor.id;
        setoresCriados++;
      }

      // Resolver cargo (cria se não existe)
      const cargoNome = String(raw.cargo).trim();
      let cargoId;
      if (!cargoNome) {
        resultados.push({ linha: lineNum, nome, erro: "Cargo vazio" });
        erros++;
        continue;
      }
      if (cargoCache.has(norm(cargoNome))) {
        cargoId = cargoCache.get(norm(cargoNome)).id;
      } else {
        const novoCargo = await prisma.cargo.create({ data: { nome: cargoNome } });
        cargoCache.set(norm(cargoNome), novoCargo);
        cargoId = novoCargo.id;
        cargosCriados++;
      }

      // Verificar duplicatas
      const cpf = String(raw.cpf).replace(/\D/g, "").trim() || null;
      const matricula = String(raw.matricula).trim() || null;
      if (cpf) {
        const existe = await prisma.funcionario.findFirst({ where: { cpf } });
        if (existe) {
          resultados.push({ linha: lineNum, nome, erro: `CPF ${cpf} já cadastrado (${existe.nome})` });
          erros++;
          continue;
        }
      }
      if (matricula) {
        const existe = await prisma.funcionario.findFirst({ where: { matricula } });
        if (existe) {
          resultados.push({ linha: lineNum, nome, erro: `Matrícula ${matricula} já cadastrada` });
          erros++;
          continue;
        }
      }

      // Montar dados
      const tipoContrato = CONTRATO_MAP[norm(raw.tipoContrato)] || "CLT";
      const turno = TURNO_MAP[norm(raw.turno)] || (String(raw.turno).trim() ? String(raw.turno).trim() : null);
      const salario = parseFloat(String(raw.salario).replace(/[^\d.,]/g, "").replace(",", ".")) || null;
      const jornadaHoras = parseInt(raw.jornadaHoras) || 44;

      try {
        await prisma.funcionario.create({
          data: {
            nome,
            cpf: cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : null,
            rg: String(raw.rg).trim() || null,
            dataNascimento: parseData(raw.dataNascimento),
            email: String(raw.email).trim() || null,
            telefone: String(raw.telefone).trim() || null,
            endereco: String(raw.endereco).trim() || null,
            cidadeUF: String(raw.cidadeUF).trim() || null,
            matricula,
            dataAdmissao,
            setorId,
            cargoId,
            salario,
            tipoContrato,
            jornadaHoras,
            turno,
            observacao: String(raw.observacao).trim() || null,
          },
        });
        criados++;
        resultados.push({ linha: lineNum, nome, ok: true });
      } catch (e) {
        erros++;
        resultados.push({ linha: lineNum, nome, erro: e.message?.slice(0, 100) });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORTAR_FUNCIONARIOS",
        entity: "Funcionario",
        entityId: "bulk",
        diff: { total: rows.length, criados, erros, setoresCriados, cargosCriados },
      },
    });

    return NextResponse.json({
      success: true,
      total: rows.length,
      criados,
      erros,
      setoresCriados,
      cargosCriados,
      detalhes: resultados,
    });
  } catch (e) {
    console.error("Erro importar funcionarios:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
