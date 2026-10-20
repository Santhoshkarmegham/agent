import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadEnvironmentConfig } from '../src/config/env';
import {
  DISCOVER_CHARACTER_TYPE,
  DISCOVER_EPISODE_TYPE,
  DISCOVER_FILTER_CHARACTER,
  DISCOVER_FILTER_EPISODE,
  DISCOVER_FILTER_LOCATION,
  DISCOVER_LOCATION_TYPE,
  DISCOVER_QUERY_ROOT,
  DISCOVER_SCHEMA_CAPABILITIES,
} from '../src/graphql/queries';

type GraphQLEnvelope<T> = {
  data?: T;
  errors?: Array<Record<string, unknown>>;
};

const environment = loadEnvironmentConfig();

const send = async <T>(query: string): Promise<T> => {
  const response = await fetch(`${environment.baseURL}${environment.graphqlPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const payload = (await response.json()) as GraphQLEnvelope<T>;
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Schema discovery failed: ${JSON.stringify(payload.errors ?? [{ status: response.status }])}`);
  }

  return payload.data as T;
};

const extractFieldNames = (fields: Array<{ name: string; type: { kind: string; name: string | null } }>) => fields.map((field) => field.name);

const main = async (): Promise<void> => {
  const capabilities = await send<{ __schema: { queryType: { name: string }; mutationType: { name: string } | null; subscriptionType: { name: string } | null } }>(DISCOVER_SCHEMA_CAPABILITIES);
  const queryRoot = await send<{ __type: { fields: Array<{ name: string; args: Array<{ name: string; type: { kind: string; name: string | null } }>; type: { kind: string; name: string | null } }> } }>(DISCOVER_QUERY_ROOT);
  const filterCharacter = await send<{ __type: { inputFields: Array<{ name: string }> } }>(DISCOVER_FILTER_CHARACTER);
  const filterLocation = await send<{ __type: { inputFields: Array<{ name: string }> } }>(DISCOVER_FILTER_LOCATION);
  const filterEpisode = await send<{ __type: { inputFields: Array<{ name: string }> } }>(DISCOVER_FILTER_EPISODE);
  const characterType = await send<{ __type: { fields: Array<{ name: string; type: { kind: string; name: string | null } }> } }>(DISCOVER_CHARACTER_TYPE);
  const locationType = await send<{ __type: { fields: Array<{ name: string; type: { kind: string; name: string | null } }> } }>(DISCOVER_LOCATION_TYPE);
  const episodeType = await send<{ __type: { fields: Array<{ name: string; type: { kind: string; name: string | null } }> } }>(DISCOVER_EPISODE_TYPE);

  const inventory = {
    endpoint: `${environment.baseURL}${environment.graphqlPath}`,
    discoveredAt: new Date().toISOString(),
    support: {
      queries: Boolean(capabilities.__schema.queryType?.name),
      mutations: Boolean(capabilities.__schema.mutationType?.name),
      subscriptions: Boolean(capabilities.__schema.subscriptionType?.name),
    },
    operations: queryRoot.__type.fields.map((field) => ({
      name: field.name,
      args: field.args.map((argument) => argument.name),
      returnType: field.type.name || field.type.kind,
    })),
    filters: {
      Character: filterCharacter.__type.inputFields.map((field) => field.name),
      Location: filterLocation.__type.inputFields.map((field) => field.name),
      Episode: filterEpisode.__type.inputFields.map((field) => field.name),
    },
    nestedRelationships: {
      Character: extractFieldNames(characterType.__type.fields).filter((field) => ['origin', 'location', 'episode'].includes(field)),
      Location: extractFieldNames(locationType.__type.fields).filter((field) => ['residents'].includes(field)),
      Episode: extractFieldNames(episodeType.__type.fields).filter((field) => ['characters'].includes(field)),
    },
    notes: [
      'Discovery used multiple shallow introspection queries because the public GraphQL endpoint enforces an introspection depth limit.',
      'No mutation root and no subscription root were returned by the live schema.',
    ],
  };

  const outputDir = path.resolve(process.cwd(), 'artifacts/discovery');
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(path.join(outputDir, 'operation-inventory.json'), JSON.stringify(inventory, null, 2), 'utf-8');
  writeFileSync(
    path.join(outputDir, 'operation-inventory.md'),
    [
      '# GraphQL operation inventory',
      '',
      `- Endpoint: ${inventory.endpoint}`,
      `- Discovered at: ${inventory.discoveredAt}`,
      `- Mutations supported: ${inventory.support.mutations ? 'yes' : 'no'}`,
      `- Subscriptions supported: ${inventory.support.subscriptions ? 'yes' : 'no'}`,
      '',
      '## Operations',
      ...inventory.operations.map((operation) => `- ${operation.name}(${operation.args.join(', ') || 'no arguments'}) -> ${operation.returnType}`),
      '',
      '## Filters',
      `- Character: ${inventory.filters.Character.join(', ')}`,
      `- Location: ${inventory.filters.Location.join(', ')}`,
      `- Episode: ${inventory.filters.Episode.join(', ')}`,
      '',
      '## Nested relationships',
      `- Character: ${inventory.nestedRelationships.Character.join(', ')}`,
      `- Location: ${inventory.nestedRelationships.Location.join(', ')}`,
      `- Episode: ${inventory.nestedRelationships.Episode.join(', ')}`,
      '',
      '## Notes',
      ...inventory.notes.map((note) => `- ${note}`),
      '',
    ].join('\n'),
    'utf-8'
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
