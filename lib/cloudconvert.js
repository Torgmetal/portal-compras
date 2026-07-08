// Conversão de arquivos via CloudConvert (v2). Usado pra converter a proposta
// (.docx) em PDF antes de mandar pro cliente. Requer CLOUDCONVERT_API_KEY na env
// (Vercel + .env.local) — criar em cloudconvert.com → Dashboard → API Keys, com
// os escopos task.read e task.write.
const API = "https://api.cloudconvert.com/v2";
const SYNC = "https://sync.api.cloudconvert.com/v2";

export function cloudConvertConfigurado() {
  return !!process.env.CLOUDCONVERT_API_KEY;
}

async function msgErro(res, fallback) {
  let b = {};
  try { b = await res.json(); } catch { /* corpo não-JSON */ }
  const m = b?.message || b?.errors?.[0]?.detail || b?.errors?.[0]?.message || b?.error || fallback;
  return `${m} (HTTP ${res.status})`;
}

export async function converterDocxParaPdf(buffer, filename = "proposta.docx") {
  const key = process.env.CLOUDCONVERT_API_KEY;
  if (!key) throw new Error("Conversão para PDF indisponível: configure CLOUDCONVERT_API_KEY.");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // 1) cria o job (importa base64 → converte → exporta URL)
  const jobRes = await fetch(`${API}/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tasks: {
        "import-1": { operation: "import/base64", file: buffer.toString("base64"), filename },
        "convert-1": { operation: "convert", input: "import-1", input_format: "docx", output_format: "pdf" },
        "export-1": { operation: "export/url", input: "convert-1" },
      },
    }),
  });
  if (!jobRes.ok) throw new Error("CloudConvert (criar job): " + (await msgErro(jobRes, "falha ao criar o job")));
  const jobId = (await jobRes.json().catch(() => ({})))?.data?.id;
  if (!jobId) throw new Error("CloudConvert: job sem id.");

  // 2) espera terminar — endpoint SÍNCRONO (bloqueia até finished/error).
  const waitRes = await fetch(`${SYNC}/jobs/${jobId}`, { headers });
  if (!waitRes.ok) throw new Error("CloudConvert (aguardar): " + (await msgErro(waitRes, "falha ao converter")));
  const job = (await waitRes.json().catch(() => ({})))?.data || {};
  if (job.status !== "finished") {
    const tErr = (job.tasks || []).find((t) => t.status === "error");
    const det = tErr ? ` — ${tErr.message || ""}${tErr.code ? " [" + tErr.code + "]" : ""}` : "";
    throw new Error(`CloudConvert: conversão ${job.status || "?"}${det}`);
  }

  // 3) URL do PDF
  const exportTask = (job.tasks || []).find((t) => t.operation === "export/url" && t.status === "finished");
  const file = exportTask?.result?.files?.[0];
  if (!file?.url) throw new Error("CloudConvert: PDF não retornado (sem export URL).");

  // 4) baixa o PDF
  const pdfRes = await fetch(file.url);
  if (!pdfRes.ok) throw new Error("CloudConvert: falha ao baixar o PDF (HTTP " + pdfRes.status + ").");
  return Buffer.from(await pdfRes.arrayBuffer());
}
