import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

type RequestLogEntry = {
  timestamp: string;
  runner: string;
  operationName: string;
  query: string;
  sanitizedVariables?: unknown;
  httpStatus: number;
  responseTimeMs: number;
  graphqlErrors: unknown[];
  hasData: boolean;
};

const sanitizeVariables = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeVariables(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, innerValue]) => [key, sanitizeVariables(innerValue)])
    );
  }

  return value;
};

export class RequestLogWriter {
  private readonly filePath: string;

  constructor(private readonly runner = process.env.GRAPHQL_RUNNER || 'unknown') {
    const dir = path.resolve(process.cwd(), 'artifacts/request-logs');
    mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${this.runner}-${process.pid}.jsonl`);
  }

  append(entry: Omit<RequestLogEntry, 'timestamp' | 'runner' | 'sanitizedVariables'> & { sanitizedVariables?: unknown }): void {
    const payload: RequestLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      runner: this.runner,
      sanitizedVariables: sanitizeVariables(entry.sanitizedVariables),
    };

    appendFileSync(this.filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
  }
}
