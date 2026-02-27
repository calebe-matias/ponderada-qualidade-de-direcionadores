const { extractProcessFromUpload } = require("../client/asis-api-client");

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runUploadAttempts({
  client,
  filePath,
  attempts = 10,
  concurrency = 3,
  authMode = "valid"
}) {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < attempts) {
      const current = cursor;
      cursor += 1;
      try {
        const upload = await client.uploadFile(filePath, { authMode });
        const processo = extractProcessFromUpload(upload.data);
        results[current] = {
          ok: Boolean(processo && processo.id),
          status: upload.status,
          durationMs: upload.durationMs,
          processId: processo ? processo.id : null
        };
      } catch (error) {
        results[current] = {
          ok: false,
          status: error.status || 0,
          durationMs: error.durationMs || 0,
          error: error.message
        };
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.max(1, concurrency); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const latencies = results.map((r) => r.durationMs);
  const successCount = results.filter((r) => r.ok).length;

  return {
    total: results.length,
    successCount,
    successRate: results.length > 0 ? successCount / results.length : 0,
    p95Ms: percentile(latencies, 95),
    avgMs: latencies.length > 0 ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)) : 0,
    results
  };
}

module.exports = {
  runUploadAttempts,
  percentile
};
