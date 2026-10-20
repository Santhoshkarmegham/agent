import { Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import runtimeInputs from '../../test-data/graphql/runtime-inputs.json';
import {
  CHARACTER_QUERY,
  CHARACTERS_BY_IDS_QUERY,
  CHARACTERS_QUERY,
  EPISODE_QUERY,
  EPISODES_QUERY,
  INVALID_FIELD_QUERY,
  LOCATION_QUERY,
  LOCATIONS_QUERY,
  OMIT_REQUIRED_ARGUMENT_QUERY,
  UNSUPPORTED_MUTATION_QUERY,
} from '../../src/graphql/queries';
import {
  expectCharacter,
  expectEpisode,
  expectGraphQLError,
  expectGraphQLSuccess,
  expectLocation,
  expectPaginationConnection,
  getByPath,
} from '../../src/utils/graphql-assertions';
import {
  runAliasMultiQueryWorkflow,
  runCharacterEpisodeConsistencyWorkflow,
  runCrossQueryDataConsistencyWorkflow,
  runCrossResourceRelationshipWorkflow,
  runFragmentWorkflow,
  runLocationResidentConsistencyWorkflow,
} from '../../src/workflows/graphql-e2e-workflows';
import { GraphQLWorld } from './world';

When('I query characters using the runtime filter data', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDCharactersFiltered', CHARACTERS_QUERY, runtimeInputs.charactersFilter as Record<string, unknown>);
});

When('I query the runtime character id', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDCharacter', CHARACTER_QUERY, { id: runtimeInputs.characterId });
});

When('I query the runtime character ids', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDCharactersByIds', CHARACTERS_BY_IDS_QUERY, { ids: runtimeInputs.characterIds });
});

When('I query the runtime locations and episodes', async function (this: GraphQLWorld) {
  this.storedResults.locations = await this.client.execute('BDDLocations', LOCATIONS_QUERY, runtimeInputs.locationRequest as Record<string, unknown>);
  this.storedResults.episodes = await this.client.execute('BDDEpisodes', EPISODES_QUERY, runtimeInputs.episodeRequest as Record<string, unknown>);
});

When('I chain from the first discovered character to its location and first episode', async function (this: GraphQLWorld) {
  const characters = await this.client.execute('BDDCharactersForChain', CHARACTERS_QUERY, { page: 1 });
  const firstCharacter = (characters.body.data as any)?.characters?.results?.[0] as any;

  const character = await this.client.execute('BDDCharacterForChain', CHARACTER_QUERY, { id: firstCharacter.id });
  const characterBody = (character.body.data as any)?.character as any;

  this.storedResults.locationById = await this.client.execute('BDDLocationById', LOCATION_QUERY, { id: characterBody.location.id });
  this.storedResults.episodeById = await this.client.execute('BDDEpisodeById', EPISODE_QUERY, { id: characterBody.episode[0].id });
});

When('I query a nonexistent character id', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDCharacterMissing', CHARACTER_QUERY, { id: runtimeInputs.nonexistentCharacterId });
});

When('I query an invalid GraphQL field', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDInvalidField', INVALID_FIELD_QUERY);
});

When('I omit the mandatory character id argument', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDMissingCharacterId', OMIT_REQUIRED_ARGUMENT_QUERY);
});

When('I send an unsupported GraphQL mutation', async function (this: GraphQLWorld) {
  this.latestResult = await this.client.execute('BDDUnsupportedMutation', UNSUPPORTED_MUTATION_QUERY);
});

When('I run the character and episode consistency workflow', async function (this: GraphQLWorld) {
  this.workflowSummaries.characterEpisodeConsistency = await runCharacterEpisodeConsistencyWorkflow(this.client);
});

When('I run the location and resident consistency workflow', async function (this: GraphQLWorld) {
  this.workflowSummaries.locationResidentConsistency = await runLocationResidentConsistencyWorkflow(this.client);
});

When('I run the alias multi-query validation workflow', async function (this: GraphQLWorld) {
  this.workflowSummaries.aliasMultiQueryValidation = await runAliasMultiQueryWorkflow(this.client);
});

When('I run the cross-resource relationship workflow', async function (this: GraphQLWorld) {
  this.workflowSummaries.crossResourceRelationship = await runCrossResourceRelationshipWorkflow(this.client);
});

When('I run the fragment comparison workflow', async function (this: GraphQLWorld) {
  this.workflowSummaries.fragmentWorkflow = await runFragmentWorkflow(this.client);
});

When('I run the cross-query data consistency workflow', async function (this: GraphQLWorld) {
  this.workflowSummaries.crossQueryDataConsistency = await runCrossQueryDataConsistencyWorkflow(this.client);
});

Then('the latest GraphQL response is successful', function (this: GraphQLWorld) {
  expect(this.latestResult).toBeDefined();
  expectGraphQLSuccess(this.latestResult!);
});

Then('the latest GraphQL response contains paginated characters', function (this: GraphQLWorld) {
  const characters = this.latestResult?.body.data?.characters as any;
  expectPaginationConnection(characters);
  expectCharacter(characters.results[0]);
});

Then('the latest GraphQL response contains a nested character', function (this: GraphQLWorld) {
  const character = this.latestResult?.body.data?.character as any;
  expectCharacter(character);
  expectLocation(character.origin);
  expectLocation(character.location);
  expectEpisode(character.episode[0]);
});

Then('the latest GraphQL response matches the requested character ids', function (this: GraphQLWorld) {
  const characters = this.latestResult?.body.data?.charactersByIds as any[];
  expect(characters.map((character) => character.id)).toEqual(runtimeInputs.characterIds);
});

Then('the stored GraphQL response {string} is successful', function (this: GraphQLWorld, key: string) {
  expect(this.storedResults[key]).toBeDefined();
  expectGraphQLSuccess(this.storedResults[key]);
});

Then('the latest GraphQL response contains null data at {string}', function (this: GraphQLWorld, responsePath: string) {
  expect(getByPath(this.latestResult?.body, responsePath) ?? null).toBeNull();
});

Then('the latest GraphQL response has no GraphQL errors', function (this: GraphQLWorld) {
  expect(this.latestResult?.body.errors ?? []).toEqual([]);
});

Then('the latest GraphQL response contains a GraphQL error including {string}', function (this: GraphQLWorld, message: string) {
  expect(this.latestResult).toBeDefined();
  expectGraphQLError(this.latestResult!, message);
});

Then('the workflow summary {string} reports at least {int} verified checks', function (this: GraphQLWorld, key: string, minimumChecks: number) {
  const summary = this.workflowSummaries[key] as { verifiedChecks: number } | undefined;
  expect(summary).toBeDefined();
  expect(summary?.verifiedChecks ?? 0).toBeGreaterThanOrEqual(minimumChecks);
});
