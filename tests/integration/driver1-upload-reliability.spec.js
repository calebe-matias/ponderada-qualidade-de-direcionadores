const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { extractProcessFromUpload } = require("../../src/client/asis-api-client");
const { runUploadAttempts } = require("../../src/services/upload-flow");
const {
  env,
  fixturePath,
  shouldRunIntegration,
  createClient,
  ensureReportsDir
} = require("./test-helpers");

const suite = shouldRunIntegration() ? describe : describe.skip;

suite("Driver 1 - Confiabilidade do fluxo assincrono de upload", function () {
  this.timeout(600000);

  const client = createClient();

  it("BD1-T01 upload valido deve retornar processos[0].id", async function () {
    const upload = await client.uploadFile(fixturePath);
    const processo = extractProcessFromUpload(upload.data);

    expect(upload.status).to.equal(200);
    expect(processo).to.be.an("object");
    expect(processo.id).to.be.a("number");
    expect(upload.durationMs).to.be.greaterThan(0);
  });

  it("BD1-T02 upload sem chave deve retornar 401", async function () {
    let receivedStatus = 0;
    try {
      await client.uploadFile(fixturePath, { authMode: "none" });
    } catch (error) {
      receivedStatus = Number(error.status || 0);
    }

    expect(receivedStatus).to.equal(401);
  });

  it("BD1-T03 burst concorrente deve medir sucesso e latencia", async function () {
    const summary = await runUploadAttempts({
      client,
      filePath: fixturePath,
      attempts: 20,
      concurrency: 5
    });

    const reportPath = path.resolve(ensureReportsDir(), "driver1-upload-summary.json");
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf8");

    expect(summary.total).to.equal(20);
    expect(summary.successCount).to.be.greaterThan(0);
    expect(summary.p95Ms).to.be.greaterThan(0);

    if (env.assertSlo) {
      expect(summary.successRate).to.be.at.least(0.99);
    }
  });
});
