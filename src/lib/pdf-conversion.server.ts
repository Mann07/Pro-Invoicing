/**
 * iLovePDF (iLoveAPI) Word→PDF conversion service.
 * Server-only. Reads ILOVEPDF_PUBLIC_KEY / ILOVEPDF_SECRET_KEY from env.
 * Docs: https://developer.ilovepdf.com/docs/api-reference
 *
 * Flow: auth → start(officepdf) → upload → process → download.
 */

const API_BASE = "https://api.ilovepdf.com/v1";

let cachedToken: { token: string; exp: number } | null = null;

function log(step: string, meta?: Record<string, unknown>) {
  // Never log keys or file bytes.
  console.log(`[ilovepdf] ${step}`, meta ?? "");
}

async function authenticate(): Promise<string> {
  const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
  if (!publicKey) throw new Error("ILOVEPDF_PUBLIC_KEY not configured");

  // JWTs from iLovePDF are valid ~2h. Cache for 90 min.
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const res = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: publicKey }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`iLovePDF auth failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const { token } = (await res.json()) as { token: string };
  if (!token) throw new Error("iLovePDF auth returned no token");
  cachedToken = { token, exp: Date.now() + 90 * 60_000 };
  return token;
}

async function startTask(token: string): Promise<{ server: string; task: string }> {
  const res = await fetch(`${API_BASE}/start/officepdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`iLovePDF start failed (${res.status})`);
  const json = (await res.json()) as { server: string; task: string };
  if (!json.server || !json.task) throw new Error("iLovePDF start missing server/task");
  return json;
}

async function uploadFile(
  server: string,
  token: string,
  task: string,
  file: Uint8Array,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("task", task);
  form.append(
    "file",
    new Blob([file as unknown as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    filename,
  );
  const res = await fetch(`https://${server}/v1/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`iLovePDF upload failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const { server_filename } = (await res.json()) as { server_filename: string };
  if (!server_filename) throw new Error("iLovePDF upload returned no server_filename");
  return server_filename;
}

async function processTask(
  server: string,
  token: string,
  task: string,
  serverFilename: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`https://${server}/v1/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      tool: "officepdf",
      files: [{ server_filename: serverFilename, filename }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`iLovePDF process failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

async function downloadResult(server: string, token: string, task: string): Promise<Uint8Array> {
  const res = await fetch(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`iLovePDF download failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Only retry transient failures (network, 5xx-ish messages).
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /fetch failed|network|timeout|50\d|429/i.test(msg);
      if (!transient || i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Convert a DOCX buffer to a PDF buffer via iLovePDF.
 * Throws on failure; callers should catch and record the error.
 */
export async function convertDocxToPdf(
  docx: Uint8Array | ArrayBuffer,
  filename = "invoice.docx",
): Promise<Uint8Array> {
  const bytes = docx instanceof Uint8Array ? docx : new Uint8Array(docx);
  return withRetry(async () => {
    const token = await authenticate();
    log("start");
    const { server, task } = await startTask(token);
    log("upload", { task, bytes: bytes.byteLength });
    const serverFilename = await uploadFile(server, token, task, bytes, filename);
    log("process", { task });
    await processTask(server, token, task, serverFilename, filename);
    log("download", { task });
    const pdf = await downloadResult(server, token, task);
    log("done", { task, bytes: pdf.byteLength });
    return pdf;
  });
}
