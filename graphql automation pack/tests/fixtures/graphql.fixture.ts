import { expect, test as base } from '@playwright/test';

import { GraphQLClient } from '../../src/clients/graphql-client';

type GraphQLFixtures = {
  graphql: GraphQLClient;
};

export const test = base.extend<GraphQLFixtures>({
  graphql: async ({ request }, use) => {
    await use(new GraphQLClient(request));
  },
});

export { expect };
