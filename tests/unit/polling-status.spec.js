const { expect } = require("chai");
const { pollProcessStatus } = require("../../src/services/polling-status");

function transientError(status) {
  const error = new Error(`HTTP ${status}`);
  error.status = status;
  return error;
}

describe("Polling status service", function () {
  it("BD2-T02 deve aplicar retry com backoff para erro transitorio e concluir", async function () {
    let calls = 0;
    const client = {
      async getProcess() {
        calls += 1;
        if (calls === 1) {
          throw transientError(503);
        }
        return {
          data: {
            status: 201
          }
        };
      }
    };

    const result = await pollProcessStatus({
      client,
      processId: 123,
      timeoutMs: 2000,
      intervalMs: 1,
      initialBackoffMs: 1
    });

    expect(result.outcome).to.equal("completed");
    expect(result.retries).to.equal(1);
    expect(result.attempts).to.equal(2);
  });

  it("BD2-T03 deve classificar 404 como not_found sem loop infinito", async function () {
    const client = {
      async getProcess() {
        throw transientError(404);
      }
    };

    const result = await pollProcessStatus({
      client,
      processId: 99999999,
      timeoutMs: 2000,
      intervalMs: 1
    });

    expect(result.outcome).to.equal("not_found");
    expect(result.terminalStatus).to.equal(404);
    expect(result.timedOut).to.equal(false);
  });

  it("BD2-T01 deve encerrar com timeout controlado quando processo nao finaliza", async function () {
    const client = {
      async getProcess() {
        return {
          data: {
            status: 100
          }
        };
      }
    };

    const result = await pollProcessStatus({
      client,
      processId: 123,
      timeoutMs: 50,
      intervalMs: 10
    });

    expect(result.outcome).to.equal("timeout");
    expect(result.timedOut).to.equal(true);
    expect(result.elapsedMs).to.be.at.least(50);
  });
});
