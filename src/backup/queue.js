/**
 * رتل تحكم بالتزامن (Concurrency Queue) ودعم Retries مع Exponential Backoff
 */

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class AsyncQueue {
  constructor(concurrency = 3) {
    this.concurrency = Math.max(1, concurrency);
    this.running = 0;
    this.queue = [];
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const { fn, resolve, reject } = this.queue.shift();
    this.running++;

    (async () => {
      try {
        const res = await fn();
        resolve(res);
      } catch (err) {
        reject(err);
      } finally {
        this.running--;
        this.next();
      }
    })();
  }

  async waitAll() {
    while (this.running > 0 || this.queue.length > 0) {
      await sleep(50);
    }
  }
}

async function executeWithRetry(fn, { maxRetries = 3, initialDelayMs = 1000, onRetry = null } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt > maxRetries) {
        throw err;
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      if (onRetry) {
        onRetry(err, attempt, delay);
      }
      await sleep(delay);
    }
  }
}

module.exports = {
  AsyncQueue,
  executeWithRetry,
  sleep
};
