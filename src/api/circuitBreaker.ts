import { logger } from "../logging/logger.js";

export enum CircuitState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  timeoutReset: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  nextAttempt: number | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  timeoutReset: 60000,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private nextAttempt: number | null = null;
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.nextAttempt && Date.now() >= this.nextAttempt) {
        this.transitionToHalfOpen();
      } else {
        const waitTime = this.nextAttempt ? this.nextAttempt - Date.now() : this.config.timeout;
        logger.debug(`[CircuitBreaker:${this.name}] Circuit OPEN, failing fast (next attempt in ${waitTime}ms)`);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) {
        logger.warn(`[CircuitBreaker:${this.name}] Operation failed, using fallback: ${err}`);
        return fallback();
      }
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.lastSuccess = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;
    this.lastFailure = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED && this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeout;
    logger.warn(`[CircuitBreaker:${this.name}] Circuit OPENED after ${this.failures} failures. Next attempt in ${this.config.timeout}ms`);
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
    this.nextAttempt = null;
    logger.info(`[CircuitBreaker:${this.name}] Circuit HALF_OPEN - testing recovery`);
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = null;
    logger.info(`[CircuitBreaker:${this.name}] Circuit CLOSED - recovered after ${this.config.successThreshold} successes`);
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      nextAttempt: this.nextAttempt,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    this.nextAttempt = null;
  }

  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.HALF_OPEN) return true;
    if (this.state === CircuitState.OPEN && this.nextAttempt && Date.now() >= this.nextAttempt) {
      return true;
    }
    return false;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, config));
  }
  return breakers.get(name)!;
}

export function getAllCircuitBreakerMetrics(): Record<string, CircuitBreakerMetrics> {
  const metrics: Record<string, CircuitBreakerMetrics> = {};
  for (const [name, breaker] of breakers) {
    metrics[name] = breaker.getMetrics();
  }
  return metrics;
}

export function resetAllCircuitBreakers(): void {
  for (const breaker of breakers.values()) {
    breaker.reset();
  }
}