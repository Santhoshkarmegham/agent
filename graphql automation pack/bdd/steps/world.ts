import { After, Before, IWorldOptions, World, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { APIRequestContext, request } from '@playwright/test';

import { GraphQLClient, GraphQLExecutionResult } from '../../src/clients/graphql-client';
import { loadEnvironmentConfig } from '../../src/config/env';

export class GraphQLWorld extends World {
  apiContext!: APIRequestContext;
  client!: GraphQLClient;
  latestResult?: GraphQLExecutionResult;
  storedResults: Record<string, GraphQLExecutionResult> = {};
  workflowSummaries: Record<string, unknown> = {};

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(GraphQLWorld);
setDefaultTimeout(20_000);

Before(async function (this: GraphQLWorld) {
  const environment = loadEnvironmentConfig();
  this.apiContext = await request.newContext({
    baseURL: environment.baseURL,
    extraHTTPHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  this.client = new GraphQLClient(this.apiContext);
  this.workflowSummaries = {};
});

After(async function (this: GraphQLWorld) {
  await this.apiContext.dispose();
});
