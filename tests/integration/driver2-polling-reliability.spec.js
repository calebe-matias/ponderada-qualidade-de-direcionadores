const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { extractProcessFromUpload } = require("../../src/client/asis-api-client");
const { pollProcessStatus } = require("../../src/services/polling-status");
const {
  env,
  fixturePath,
  shouldRunIntegration,
  createClient,
  ensureReportsDir
} = require("./test-helpers");

const suite = shouldRunIntegration() ? describe : describe.skip;

suite("Driver 2 - Confiabilidade de consulta por polling de status", function () {
  this.timeout(600000);

  const client = createClient();
  let processId;

  before(async function () {
    const upload = await client.uploadFile(fixturePath);
    const processo = extractProcessFromUpload(upload.data);
    processId = processo ? processo.id : null;
    expect(processId).to.be.a("number");
  });

  it("BD2-T01 polling deve encerrar em estado terminal ou timeout controlado", async function () {
    const result = await pollProcessStatus({
      client,
      processId,
      timeoutMs: Math.min(env.pollTimeoutMs, 120000),
      intervalMs: env.pollIntervalMs
    });

    const validOutcomes = new Set(["completed", "failed_terminal", "timeout"]);
    expect(validOutcomes.has(result.outcome)).to.equal(true);
    expect(result.attempts).to.be.greaterThan(0);
  });

  it("BD2-T03 polling para processo inexistente deve retornar not_found", async function () {
    const result = await pollProcessStatus({
      client,
      processId: 999999999,
      timeoutMs: 30000,
      intervalMs: 1000
    });

    expect(result.outcome).to.equal("not_found");
    expect(result.terminalStatus).to.equal(404);
  });

  it("BD2-T04 consulta de processo com chave invalida deve retornar 401", async function () {
    let receivedStatus = 0;
    try {
      await client.getProcess(processId, { authMode: "invalid" });
    } catch (error) {
      receivedStatus = Number(error.status || 0);
    }

    expect(receivedStatus).to.equal(401);
  });

  after(async function () {
    const result = await pollProcessStatus({
      client,
      processId,
      timeoutMs: Math.min(env.pollTimeoutMs, 60000),
      intervalMs: env.pollIntervalMs
    });
    const reportPath = path.resolve(ensureReportsDir(), "driver2-polling-summary.json");
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
  });
});
