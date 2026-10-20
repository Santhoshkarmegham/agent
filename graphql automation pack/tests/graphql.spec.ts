import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import runtimeInputs from '../test-data/graphql/runtime-inputs.json';
import {
  CHARACTER_QUERY,
  CHARACTER_SELECTION_QUERY,
  CHARACTERS_BY_IDS_QUERY,
  CHARACTERS_QUERY,
  EPISODE_QUERY,
  EPISODES_QUERY,
  INVALID_FIELD_QUERY,
  LOCATION_QUERY,
  LOCATIONS_QUERY,
  OMIT_REQUIRED_ARGUMENT_QUERY,
  UNSUPPORTED_MUTATION_QUERY,
  UNSUPPORTED_SUBSCRIPTION_QUERY,
} from '../src/graphql/queries';
import {
  expectCharacter,
  expectEpisode,
  expectGraphQLError,
  expectGraphQLSuccess,
  expectLocation,
  expectPaginationConnection,
} from '../src/utils/graphql-assertions';
import {
  runAliasMultiQueryWorkflow,
  runCharacterEpisodeConsistencyWorkflow,
  runCrossQueryDataConsistencyWorkflow,
  runCrossResourceRelationshipWorkflow,
  runFragmentWorkflow,
  runLocationResidentConsistencyWorkflow,
} from '../src/workflows/graphql-e2e-workflows';
import { expect, test } from './fixtures/graphql.fixture';

const discoveryInventoryPath = path.resolve(process.cwd(), 'artifacts/discovery/operation-inventory.json');

test.describe('Rick and Morty GraphQL API', () => {
  test('discover-the-query-inventory-and-confirm-mutations-and-subscriptions-are-not-supported', async () => {
    expect(existsSync(discoveryInventoryPath)).toBeTruthy();

    const inventory = JSON.parse(readFileSync(discoveryInventoryPath, 'utf-8')) as {
      support: { mutations: boolean; subscriptions: boolean };
      operations: Array<{ name: string; args: string[] }>;
      filters: Record<string, string[]>;
      nestedRelationships: Record<string, string[]>;
    };

    expect(inventory.support.mutations).toBeFalsy();
    expect(inventory.support.subscriptions).toBeFalsy();
    expect(inventory.operations.map((operation) => operation.name)).toEqual([
      'character',
      'characters',
      'charactersByIds',
      'location',
      'locations',
      'locationsByIds',
      'episode',
      'episodes',
      'episodesByIds',
    ]);
    expect(inventory.filters.Character).toEqual(['name', 'status', 'species', 'type', 'gender']);
    expect(inventory.filters.Location).toEqual(['name', 'type', 'dimension']);
    expect(inventory.filters.Episode).toEqual(['name', 'episode']);
    expect(inventory.nestedRelationships.Character).toEqual(expect.arrayContaining(['origin', 'location', 'episode']));
    expect(inventory.nestedRelationships.Location).toEqual(expect.arrayContaining(['residents']));
    expect(inventory.nestedRelationships.Episode).toEqual(expect.arrayContaining(['characters']));
  });

  test('retrieve-all-characters-and-validate-pagination-and-response-structure', async ({ graphql }) => {
    const result = await graphql.execute('Characters', CHARACTERS_QUERY, { page: 1 });

    expectGraphQLSuccess(result);
    const connection = result.body.data?.characters as any;
    expectPaginationConnection(connection);
    expect(connection.results.length).toBeGreaterThan(0);
    expectCharacter(connection.results[0]);
  });

  test('retrieve-character-by-id-and-validate-nested-relationships', async ({ graphql }) => {
    const result = await graphql.execute('Character', CHARACTER_QUERY, { id: runtimeInputs.characterId });

    expectGraphQLSuccess(result);
    const character = result.body.data?.character as any;
    expectCharacter(character);
    expectLocation(character.origin);
    expectLocation(character.location);
    expect(Array.isArray(character.episode)).toBeTruthy();
    expect(character.episode.length).toBeGreaterThan(0);
    expectEpisode(character.episode[0]);
  });

  test('retrieve-locations-and-episodes', async ({ graphql }) => {
    const locations = await graphql.execute('Locations', LOCATIONS_QUERY, runtimeInputs.locationRequest);
    const episodes = await graphql.execute('Episodes', EPISODES_QUERY, runtimeInputs.episodeRequest);

    expectGraphQLSuccess(locations);
    expectGraphQLSuccess(episodes);
    const locationConnection = locations.body.data?.locations as any;
    const episodeConnection = episodes.body.data?.episodes as any;
    expectPaginationConnection(locationConnection);
    expectPaginationConnection(episodeConnection);
    expectLocation(locationConnection.results[0]);
    expectEpisode(episodeConnection.results[0]);
  });

  test('retrieve-multiple-characters-by-ids', async ({ graphql }) => {
    const result = await graphql.execute('CharactersByIds', CHARACTERS_BY_IDS_QUERY, { ids: runtimeInputs.characterIds });

    expectGraphQLSuccess(result);
    const characters = result.body.data?.charactersByIds as any[];
    expect(characters).toHaveLength(runtimeInputs.characterIds.length);
    expect(characters.map((character) => character.id)).toEqual(runtimeInputs.characterIds);
    characters.forEach(expectCharacter);
  });

  test('verify-filtering-by-name-species-and-status', async ({ graphql }) => {
    const result = await graphql.execute('CharactersFiltered', CHARACTERS_QUERY, runtimeInputs.charactersFilter as Record<string, unknown>);

    expectGraphQLSuccess(result);
    const characters = (result.body.data as any)?.characters?.results as any[];
    expect(characters.length).toBeGreaterThan(0);
    characters.forEach((character) => {
      expect(character.name.toLowerCase()).toContain('rick');
      expect(character.species.toLowerCase()).toContain('human');
      expect(character.status.toLowerCase()).toContain('alive');
    });
  });

  test('validate-field-selection-returns-only-requested-fields', async ({ graphql }) => {
    const result = await graphql.execute('CharacterSelection', CHARACTER_SELECTION_QUERY, { id: runtimeInputs.characterId });

    expectGraphQLSuccess(result);
    expect(Object.keys(result.body.data?.character as object)).toEqual(['id', 'name']);
  });

  test('query-nonexistent-id-returns-null-data-without-graphql-errors', async ({ graphql }) => {
    const result = await graphql.execute('CharacterMissing', CHARACTER_QUERY, { id: runtimeInputs.nonexistentCharacterId });

    expect(result.httpStatus).toBe(200);
    expect(result.body.errors ?? []).toEqual([]);
    expect(result.body.data?.character ?? null).toBeNull();
  });

  test('invalid-field-name-returns-graphql-validation-errors', async ({ graphql }) => {
    const result = await graphql.execute('InvalidField', INVALID_FIELD_QUERY);

    expectGraphQLError(result, 'Cannot query field');
    expect(result.body.data).toBeUndefined();
  });

  test('incorrect-variable-types-return-graphql-errors', async ({ graphql }) => {
    const result = await graphql.execute('CharacterWrongVariableType', CHARACTER_QUERY, runtimeInputs.invalidVariableType as Record<string, unknown>);

    expectGraphQLError(result, 'ID cannot represent value');
  });

  test('omitting-mandatory-arguments-returns-graphql-validation-errors', async ({ graphql }) => {
    const result = await graphql.execute('MissingCharacterId', OMIT_REQUIRED_ARGUMENT_QUERY);

    expectGraphQLError(result, 'required, but it was not provided');
  });

  test('unsupported-mutation-and-subscription-operations-return-graphql-errors', async ({ graphql }) => {
    const mutation = await graphql.execute('UnsupportedMutation', UNSUPPORTED_MUTATION_QUERY);
    const subscription = await graphql.execute('UnsupportedSubscription', UNSUPPORTED_SUBSCRIPTION_QUERY);

    expectGraphQLError(mutation, 'configured for mutations');
    expectGraphQLError(subscription, 'configured for subscriptions');
  });

  test('chain-results-between-graph-operations-without-hardcoded-dependent-ids', async ({ graphql }) => {
    const characters = await graphql.execute('CharactersForChain', CHARACTERS_QUERY, { page: 1 });

    expectGraphQLSuccess(characters);
    const firstCharacter = (characters.body.data as any)?.characters?.results?.[0] as any;
    expectCharacter(firstCharacter);

    const characterDetails = await graphql.execute('CharacterForChain', CHARACTER_QUERY, { id: firstCharacter.id });
    expectGraphQLSuccess(characterDetails);
    const character = characterDetails.body.data?.character as any;

    const location = await graphql.execute('LocationForChain', LOCATION_QUERY, { id: character.location.id });
    const episode = await graphql.execute('EpisodeForChain', EPISODE_QUERY, { id: character.episode[0].id });

    expectGraphQLSuccess(location);
    expectGraphQLSuccess(episode);
    expectLocation(location.body.data?.location);
    expectEpisode(episode.body.data?.episode);
  });

  test('[E2E] character-episode-consistency-across-separate-graphql-responses', async ({ graphql }) => {
    const summary = await runCharacterEpisodeConsistencyWorkflow(graphql);

    expect(summary.verifiedChecks).toBeGreaterThanOrEqual(4);
    expect(summary.ids.episodeIds).toBeTruthy();
  });

  test('[E2E] location-resident-consistency-and-empty-resident-handling', async ({ graphql }) => {
    const summary = await runLocationResidentConsistencyWorkflow(graphql);

    expect(summary.verifiedChecks).toBeGreaterThanOrEqual(3);
    expect(summary.ids.locationId).toBeTruthy();
  });

  test('[E2E] alias-based-multi-query-validation-against-separate-queries', async ({ graphql }) => {
    const summary = await runAliasMultiQueryWorkflow(graphql);

    expect(summary.verifiedChecks).toBeGreaterThanOrEqual(4);
    expect(summary.ids.characterId).toBeTruthy();
  });

  test('[E2E] cross-resource-origin-and-location-relationship-validation', async ({ graphql }) => {
    const summary = await runCrossResourceRelationshipWorkflow(graphql);

    expect(summary.verifiedChecks).toBeGreaterThanOrEqual(2);
    expect(summary.ids.characterId).toBeTruthy();
  });

  test('[E2E] fragment-based-query-results-match-non-fragment-baselines', async ({ graphql }) => {
    const summary = await runFragmentWorkflow(graphql);

    expect(summary.verifiedChecks).toBeGreaterThanOrEqual(2);
    expect(summary.ids.characterId).toBeTruthy();
  });

  test('[E2E] cross-query-data-consistency-across-related-graphql-operations', async ({ graphql }) => {
    const summary = await runCrossQueryDataConsistencyWorkflow(graphql);

    expect(summary.verifiedChecks).toBeGreaterThanOrEqual(5);
    expect(summary.ids.characterId).toBeTruthy();
  });
});
