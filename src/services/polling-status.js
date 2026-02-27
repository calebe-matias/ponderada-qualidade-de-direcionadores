const TERMINAL_STATUSES = new Set([201, 500]);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientStatus(status) {
  return status === 408 || status === 429 || status >= 500 || status === 0 || status === undefined;
}

async function pollProcessStatus({
  client,
  processId,
  timeoutMs,
  intervalMs,
  maxRetries = 3,
  initialBackoffMs = 300,
  authMode = "valid",
  sleepFn = sleep,
  nowFn = Date.now
}) {
  const startedAt = nowFn();
  let attempts = 0;
  let retries = 0;
  let lastStatus = null;
  const errors = [];

  while (nowFn() - startedAt < timeoutMs) {
    attempts += 1;
    try {
      const response = await client.getProcess(processId, { authMode });
      lastStatus = Number(response.data.status);
      if (TERMINAL_STATUSES.has(lastStatus)) {
        return {
          processId,
          outcome: lastStatus === 201 ? "completed" : "failed_terminal",
          terminalStatus: lastStatus,
          timedOut: false,
          attempts,
          retries,
          errors,
          elapsedMs: nowFn() - startedAt
        };
      }
      await sleepFn(intervalMs);
    } catch (error) {
      const status = Number(error.status || (error.response ? error.response.status : 0));
      lastStatus = status;
      if (status === 404) {
        return {
          processId,
          outcome: "not_found",
          terminalStatus: status,
          timedOut: false,
          attempts,
          retries,
          errors,
          elapsedMs: nowFn() - startedAt
        };
      }
      if (isTransientStatus(status) && retries < maxRetries) {
        const backoffMs = initialBackoffMs * (2 ** retries);
        retries += 1;
        errors.push({
          status,
          retried: true
        });
        await sleepFn(backoffMs);
        continue;
      }
      errors.push({
        status,
        retried: false
      });
      return {
        processId,
        outcome: "error",
        terminalStatus: status,
        timedOut: false,
        attempts,
        retries,
        errors,
        elapsedMs: nowFn() - startedAt
      };
    }
  }

  return {
    processId,
    outcome: "timeout",
    terminalStatus: lastStatus,
    timedOut: true,
    attempts,
    retries,
    errors,
    elapsedMs: nowFn() - startedAt
  };
}

module.exports = {
  TERMINAL_STATUSES,
  isTransientStatus,
  pollProcessStatus
};
