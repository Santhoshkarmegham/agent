import { APIRequestContext, expect } from '@playwright/test';

import { loadEnvironmentConfig } from '../config/env';
import { RequestLogWriter } from '../reporting/request-log-writer';

export type GraphQLExecutionResult<T = Record<string, unknown>> = {
  operationName: string;
  query: string;
  variables?: Record<string, unknown>;
  httpStatus: number;
  responseTimeMs: number;
  body: {
    data?: T;
    errors?: Array<Record<string, unknown>>;
  };
};

export class GraphQLClient {
  private static lastRequestAt = 0;

  private readonly environment = loadEnvironmentConfig();
  private readonly logWriter = new RequestLogWriter();

  constructor(private readonly request: APIRequestContext) {}

  private resolveOperationName(query: string, requestedOperationName?: string): string {
    const match = query.match(/\b(query|mutation|subscription)\s+(\w+)/);
    if (match?.[2]) {
      return match[2];
    }

    return requestedOperationName || 'AnonymousOperation';
  }

  private getRetryDelay(body: { data?: unknown; errors?: Array<Record<string, unknown>> }): number {
    const retryAfter = body.errors?.find((error) => {
      const details = (error.extensions as Record<string, any> | undefined)?.stellate?.details;
      return Array.isArray(details?.rules) && typeof details.rules[0]?.retryAfter === 'number';
    });

    const retrySeconds = (retryAfter?.extensions as Record<string, any> | undefined)?.stellate?.details?.rules?.[0]?.retryAfter;
    return typeof retrySeconds === 'number' ? retrySeconds * 1000 : 1000;
  }

  private shouldRetry(httpStatus: number, body: { data?: unknown; errors?: Array<Record<string, unknown>> }): boolean {
    return httpStatus === 429 || (body.errors ?? []).some((error) => String(error.message || '').includes('RATE_LIMIT_EXCEEDED'));
  }

  private async throttle(): Promise<void> {
    const minimumGapMs = 800;
    const elapsed = Date.now() - GraphQLClient.lastRequestAt;

    if (elapsed < minimumGapMs) {
      await new Promise((resolve) => setTimeout(resolve, minimumGapMs - elapsed));
    }
  }

  async execute<T = Record<string, unknown>>(
    operationName: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<GraphQLExecutionResult<T>> {
    const resolvedOperationName = this.resolveOperationName(query, operationName);
    let attempts = 0;

    while (attempts < 6) {
      attempts += 1;
      await this.throttle();
      const startedAt = Date.now();
      const response = await this.request.post(this.environment.graphqlPath, {
        data: {
          operationName: resolvedOperationName,
          query,
          variables,
        },
      });
      GraphQLClient.lastRequestAt = Date.now();

      const responseTimeMs = Date.now() - startedAt;
      const body = (await response.json()) as GraphQLExecutionResult<T>['body'];

      if (this.shouldRetry(response.status(), body) && attempts < 6) {
        await new Promise((resolve) => setTimeout(resolve, this.getRetryDelay(body)));
        continue;
      }

      this.logWriter.append({
        operationName: resolvedOperationName,
        query,
        sanitizedVariables: variables,
        httpStatus: response.status(),
        responseTimeMs,
        graphqlErrors: body.errors ?? [],
        hasData: typeof body.data !== 'undefined',
      });

      return {
        operationName: resolvedOperationName,
        query,
        variables,
        httpStatus: response.status(),
        responseTimeMs,
        body,
      };
    }

    throw new Error(`GraphQL request retry limit reached for ${resolvedOperationName}`);
  }

  expectHttp200(result: GraphQLExecutionResult): void {
    expect(result.httpStatus).toBe(200);
  }
}
