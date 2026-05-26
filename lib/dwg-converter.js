// Conversao de DWG/DXF para PDF via CloudConvert API.
// Requer CLOUDCONVERT_API_KEY configurado como env var.
//
// Fluxo:
//   1. Cria job com tasks: import/upload → convert → export/url
//   2. Faz upload do buffer do arquivo
//   3. Poll ate concluir
//   4. Baixa o PDF convertido
//
// Limite free: 25 min/dia (cada DWG ~30s = ~50 DWGs/dia gratis)
import "server-only";

const API_BASE = "https://api.cloudconvert.com/v2";

function getApiKey() {
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) {
    throw new Error(
      "CLOUDCONVERT_API_KEY nao configurado. Acesse cloudconvert.com > Dashboard > API Keys para gerar."
    );
  }
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Converte um buffer DWG/DXF para PDF via CloudConvert.
 *
 * @param {Buffer} fileBuffer - conteudo do arquivo DWG/DXF
 * @param {string} fileName - nome original (ex: "estrutura.dwg")
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=120000] - timeout maximo pra esperar a conversao
 * @param {number} [opts.pollIntervalMs=3000] - intervalo entre polls
 * @returns {Promise<{ pdfBuffer: Buffer, pdfName: string }>}
 */
export async function convertDwgToPdf(fileBuffer, fileName, opts = {}) {
  const { timeoutMs = 120_000, pollIntervalMs = 3000 } = opts;
  const ext = fileName.split(".").pop()?.toLowerCase() || "dwg";
  const inputFormat = ext === "dxf" ? "dxf" : "dwg";
  const pdfName = fileName.replace(/\.(dwg|dxf)$/i, ".pdf");

  // 1. Criar job com 3 tasks encadeadas
  const jobRes = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      tasks: {
        "import-file": {
          operation: "import/upload",
        },
        "convert-to-pdf": {
          operation: "convert",
          input: ["import-file"],
          input_format: inputFormat,
          output_format: "pdf",
          engine: "autocad",
          // Opcoes de conversao CAD
          page_width: 841,  // A1 landscape (mm)
          page_height: 594,
          page_orientation: "landscape",
        },
        "export-result": {
          operation: "export/url",
          input: ["convert-to-pdf"],
          inline: false,
          archive_multiple_files: false,
        },
      },
      tag: `epc-dwg-${Date.now()}`,
    }),
  });

  if (!jobRes.ok) {
    const errText = await jobRes.text().catch(() => "");
    throw new Error(`CloudConvert: falha ao criar job (HTTP ${jobRes.status}): ${errText.slice(0, 300)}`);
  }

  const job = await jobRes.json();
  const jobId = job.data.id;

  // 2. Encontrar a task de upload e enviar o arquivo
  const uploadTask = job.data.tasks.find((t) => t.name === "import-file");
  if (!uploadTask?.result?.form) {
    throw new Error("CloudConvert: task de upload nao tem form de upload");
  }

  const { url: uploadUrl, parameters } = uploadTask.result.form;

  // Montar FormData com os parametros + arquivo
  const form = new FormData();
  for (const [key, value] of Object.entries(parameters)) {
    form.append(key, value);
  }
  form.append("file", new Blob([fileBuffer]), fileName);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    body: form,
  });

  if (!uploadRes.ok && uploadRes.status !== 201 && uploadRes.status !== 204) {
    throw new Error(`CloudConvert: falha no upload (HTTP ${uploadRes.status})`);
  }

  // 3. Poll ate o job terminar
  const startedAt = Date.now();
  let finalJob;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);

    const statusRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: headers(),
    });
    if (!statusRes.ok) {
      throw new Error(`CloudConvert: falha ao consultar job (HTTP ${statusRes.status})`);
    }

    finalJob = await statusRes.json();
    const status = finalJob.data.status;

    if (status === "finished") break;
    if (status === "error") {
      const errTask = finalJob.data.tasks.find((t) => t.status === "error");
      const errMsg = errTask?.message || "Erro desconhecido na conversao";
      throw new Error(`CloudConvert: conversao falhou — ${errMsg}`);
    }
    // "waiting" ou "processing" → continua poll
  }

  if (!finalJob || finalJob.data.status !== "finished") {
    throw new Error(`CloudConvert: timeout apos ${timeoutMs / 1000}s aguardando conversao`);
  }

  // 4. Baixar o PDF do export
  const exportTask = finalJob.data.tasks.find((t) => t.name === "export-result");
  const exportFile = exportTask?.result?.files?.[0];
  if (!exportFile?.url) {
    throw new Error("CloudConvert: URL do PDF convertido nao encontrada");
  }

  const pdfRes = await fetch(exportFile.url);
  if (!pdfRes.ok) {
    throw new Error(`CloudConvert: falha ao baixar PDF convertido (HTTP ${pdfRes.status})`);
  }

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  return { pdfBuffer, pdfName };
}

/**
 * Verifica se a API key esta valida e retorna o saldo de minutos restantes.
 * Util para mostrar ao usuario se esta perto do limite diario.
 */
export async function checkCloudConvertStatus() {
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: headers(),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      ok: true,
      credits: data.data?.credits ?? null,
      minutesUsed: data.data?.minutes_used ?? null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
