import { expect } from '@playwright/test';

import { GraphQLClient } from '../clients/graphql-client';
import {
  ALIAS_MULTI_RESOURCE_QUERY,
  CHARACTER_QUERY,
  CHARACTERS_QUERY,
  CHARACTERS_RELATION_SCAN_QUERY,
  EPISODE_QUERY,
  FRAGMENT_COMPARISON_BASELINE_QUERY,
  FRAGMENT_COMPARISON_QUERY,
  LOCATION_QUERY,
  LOCATIONS_QUERY,
} from '../graphql/queries';
import {
  expectCharacter,
  expectEpisode,
  expectGraphQLSuccess,
  expectLocation,
  expectPaginationConnection,
  expectSubsetMatch,
  pickFields,
} from '../utils/graphql-assertions';

type WorkflowSummary = {
  workflow: string;
  verifiedChecks: number;
  notes: string[];
  ids: Record<string, string | string[] | undefined>;
};

const getConnection = (payload: any, key: string): any => {
  const connection = payload?.[key];
  expectPaginationConnection(connection);
  return connection;
};

const getConnectionResults = (payload: any, key: string): any[] => {
  return getConnection(payload, key).results;
};

const findCharacterByPredicate = async (
  client: GraphQLClient,
  predicate: (character: any) => boolean
): Promise<any | undefined> => {
  let page = 1;

  while (true) {
    const response = await client.execute('CharactersRelationshipScan', CHARACTERS_RELATION_SCAN_QUERY, { page });
    expectGraphQLSuccess(response);
    const connection = getConnection(response.body.data, 'characters');
    const match = connection.results.find(predicate);

    if (match) {
      return match;
    }

    if (!connection.info?.next) {
      return undefined;
    }

    page = connection.info.next;
  }
};

const findLocationByPredicate = async (
  client: GraphQLClient,
  predicate: (location: any) => boolean
): Promise<any | undefined> => {
  let page = 1;

  while (true) {
    const response = await client.execute('LocationsRelationshipScan', LOCATIONS_QUERY, { page });
    expectGraphQLSuccess(response);
    const connection = getConnection(response.body.data, 'locations');
    const match = connection.results.find(predicate);

    if (match) {
      return match;
    }

    if (!connection.info?.next) {
      return undefined;
    }

    page = connection.info.next;
  }
};

const getFirstDynamicCharacter = async (client: GraphQLClient): Promise<any> => {
  const characters = await client.execute('CharactersForE2ESelection', CHARACTERS_QUERY, { page: 1 });
  expectGraphQLSuccess(characters);
  const results = getConnectionResults(characters.body.data, 'characters');
  expect(results.length).toBeGreaterThan(0);
  return results[0];
};

const getCharacterDetails = async (client: GraphQLClient, id: string): Promise<any> => {
  const result = await client.execute('CharacterForE2EDetail', CHARACTER_QUERY, { id });
  expectGraphQLSuccess(result);
  const character = result.body.data?.character as any;
  expectCharacter(character);
  return character;
};

export const runCharacterEpisodeConsistencyWorkflow = async (client: GraphQLClient): Promise<WorkflowSummary> => {
  const characterSeed = await getFirstDynamicCharacter(client);
  const character = await getCharacterDetails(client, characterSeed.id);
  const nestedEpisodes = [...character.episode];
  const episodeIds = Array.from(new Set(nestedEpisodes.map((episode: any) => episode.id).filter(Boolean))).slice(0, 3);

  expect(episodeIds.length).toBeGreaterThan(1);

  let verifiedChecks = 0;
  for (const episodeId of episodeIds) {
    const episodeResponse = await client.execute('EpisodeConsistencyDetail', EPISODE_QUERY, { id: episodeId });
    expectGraphQLSuccess(episodeResponse);
    const episode = episodeResponse.body.data?.episode as any;
    expectEpisode(episode);
    const nestedEpisode = nestedEpisodes.find((candidate: any) => candidate.id === episodeId);

    expect(episode.characters.map((entry: any) => entry.id)).toContain(character.id);
    expectSubsetMatch(episode, nestedEpisode, ['id', 'name', 'episode', 'air_date']);
    verifiedChecks += 2;
  }

  return {
    workflow: 'characterEpisodeConsistency',
    verifiedChecks,
    notes: ['Verified that independently fetched episodes contain the dynamically selected character.'],
    ids: {
      characterId: character.id,
      episodeIds,
    },
  };
};

export const runLocationResidentConsistencyWorkflow = async (client: GraphQLClient): Promise<WorkflowSummary> => {
  const locationWithResidents = await findLocationByPredicate(client, (location) => location.residents.length > 0);
  expect(locationWithResidents).toBeTruthy();

  const residentIds = locationWithResidents.residents.slice(0, 3).map((resident: any) => resident.id);
  expect(residentIds.length).toBeGreaterThan(0);

  let verifiedChecks = 0;
  for (const residentId of residentIds) {
    const residentResponse = await client.execute('ResidentCharacterConsistency', CHARACTER_QUERY, { id: residentId });
    expectGraphQLSuccess(residentResponse);
    const resident = residentResponse.body.data?.character as any;
    expectCharacter(resident);
    expect(resident.location.id).toBe(locationWithResidents.id);
    expect(resident.location.name).toBe(locationWithResidents.name);
    verifiedChecks += 2;
  }

  const emptyLocationSeed = await findLocationByPredicate(
    client,
    (location) => location.id !== locationWithResidents.id && location.residents.length === 0
  );
  const notes: string[] = [];

  if (emptyLocationSeed) {
    const emptyLocationResponse = await client.execute('EmptyResidentLocationConsistency', LOCATION_QUERY, { id: emptyLocationSeed.id });
    expectGraphQLSuccess(emptyLocationResponse);
    const emptyLocation = emptyLocationResponse.body.data?.location as any;
    expectLocation(emptyLocation);
    expect(emptyLocation.residents).toEqual([]);
    verifiedChecks += 1;
    notes.push('Validated empty resident list handling on an independently fetched location.');
  } else {
    notes.push('No empty resident list was returned on page 1, so only populated resident relationships were checked.');
  }

  return {
    workflow: 'locationResidentConsistency',
    verifiedChecks,
    notes,
    ids: {
      locationId: locationWithResidents.id,
      residentIds,
      emptyLocationId: emptyLocationSeed?.id,
    },
  };
};

export const runAliasMultiQueryWorkflow = async (client: GraphQLClient): Promise<WorkflowSummary> => {
  const characterSeed = await getFirstDynamicCharacter(client);
  const character = await getCharacterDetails(client, characterSeed.id);

  expect(character.location?.id).toBeTruthy();
  expect(character.episode?.[0]?.id).toBeTruthy();

  const variables = {
    characterId: character.id,
    locationId: character.location.id,
    episodeId: character.episode[0].id,
  };

  const aliasResponse = await client.execute('AliasMultiResource', ALIAS_MULTI_RESOURCE_QUERY, variables);
  const singleCharacter = await client.execute('AliasCharacterBaseline', CHARACTER_QUERY, { id: variables.characterId });
  const singleLocation = await client.execute('AliasLocationBaseline', LOCATION_QUERY, { id: variables.locationId });
  const singleEpisode = await client.execute('AliasEpisodeBaseline', EPISODE_QUERY, { id: variables.episodeId });

  expectGraphQLSuccess(aliasResponse);
  expectGraphQLSuccess(singleCharacter);
  expectGraphQLSuccess(singleLocation);
  expectGraphQLSuccess(singleEpisode);

  expect(Object.keys(aliasResponse.body.data || {})).toEqual(['characterAlias', 'locationAlias', 'episodeAlias']);
  expectSubsetMatch(aliasResponse.body.data?.characterAlias, singleCharacter.body.data?.character, ['id', 'name', 'status', 'species']);
  expectSubsetMatch(aliasResponse.body.data?.locationAlias, singleLocation.body.data?.location, ['id', 'name', 'type', 'dimension']);
  expectSubsetMatch(aliasResponse.body.data?.episodeAlias, singleEpisode.body.data?.episode, ['id', 'name', 'episode', 'air_date']);

  return {
    workflow: 'aliasMultiQueryValidation',
    verifiedChecks: 4,
    notes: ['Verified alias response keys and compared aliased entities against separate queries.'],
    ids: variables,
  };
};

export const runCrossResourceRelationshipWorkflow = async (client: GraphQLClient): Promise<WorkflowSummary> => {
  const primaryCharacterSeed = await getFirstDynamicCharacter(client);
  const primaryCharacter = await getCharacterDetails(client, primaryCharacterSeed.id);
  const notes: string[] = [];
  let verifiedChecks = 0;

  if (primaryCharacter.origin?.id) {
    const originResponse = await client.execute('OriginRelationshipCheck', LOCATION_QUERY, { id: primaryCharacter.origin.id });
    expectGraphQLSuccess(originResponse);
    expectSubsetMatch(originResponse.body.data?.location, primaryCharacter.origin, ['id', 'name', 'type', 'dimension']);
    verifiedChecks += 1;
  }

  if (primaryCharacter.location?.id) {
    const locationResponse = await client.execute('CurrentLocationRelationshipCheck', LOCATION_QUERY, { id: primaryCharacter.location.id });
    expectGraphQLSuccess(locationResponse);
    expectSubsetMatch(locationResponse.body.data?.location, primaryCharacter.location, ['id', 'name', 'type', 'dimension']);
    verifiedChecks += 1;
  }

  const optionalCandidate = await findCharacterByPredicate(client, (character) => !character.origin?.id || !character.location?.id);
  if (optionalCandidate) {
    const optionalCharacter = await getCharacterDetails(client, optionalCandidate.id);
    expect(!optionalCharacter.origin?.id || !optionalCharacter.location?.id).toBeTruthy();
    notes.push(`Observed optional relationship handling on character ${optionalCharacter.id}.`);
    verifiedChecks += 1;
  } else {
    notes.push('No optional null origin or location relationship was returned in the scanned page.');
  }

  return {
    workflow: 'crossResourceRelationship',
    verifiedChecks,
    notes,
    ids: {
      characterId: primaryCharacter.id,
      originId: primaryCharacter.origin?.id,
      locationId: primaryCharacter.location?.id,
      optionalRelationCharacterId: optionalCandidate?.id,
    },
  };
};

export const runFragmentWorkflow = async (client: GraphQLClient): Promise<WorkflowSummary> => {
  const characterSeed = await getFirstDynamicCharacter(client);
  const character = await getCharacterDetails(client, characterSeed.id);

  expect(character.location?.id).toBeTruthy();

  const variables = {
    characterId: character.id,
    locationId: character.location.id,
  };

  const fragmentResponse = await client.execute('FragmentComparison', FRAGMENT_COMPARISON_QUERY, variables);
  const baselineResponse = await client.execute('FragmentComparisonBaseline', FRAGMENT_COMPARISON_BASELINE_QUERY, variables);

  expectGraphQLSuccess(fragmentResponse);
  expectGraphQLSuccess(baselineResponse);
  expect(pickFields(fragmentResponse.body.data, ['character', 'location'])).toEqual(pickFields(baselineResponse.body.data, ['character', 'location']));

  return {
    workflow: 'fragmentWorkflow',
    verifiedChecks: 2,
    notes: ['Verified fragment-based queries return the same response structure as the baseline query.'],
    ids: variables,
  };
};

export const runCrossQueryDataConsistencyWorkflow = async (client: GraphQLClient): Promise<WorkflowSummary> => {
  const characterSeed = await getFirstDynamicCharacter(client);
  const character = await getCharacterDetails(client, characterSeed.id);
  const notes: string[] = [];
  let verifiedChecks = 0;

  expectSubsetMatch(character, characterSeed, ['id', 'name', 'status', 'species']);
  verifiedChecks += 1;

  let locationId: string | undefined;
  if (character.location?.id) {
    locationId = character.location.id;
    const locationResponse = await client.execute('CrossQueryLocationConsistency', LOCATION_QUERY, { id: locationId });
    expectGraphQLSuccess(locationResponse);
    expectSubsetMatch(locationResponse.body.data?.location, character.location, ['id', 'name', 'type', 'dimension']);
    verifiedChecks += 1;
  } else {
    notes.push('Selected character did not expose a current location id, so location detail comparison was skipped.');
  }

  const episodeSeed = character.episode?.[0];
  let episodeId: string | undefined;
  if (episodeSeed?.id) {
    episodeId = episodeSeed.id;
    const episodeResponse = await client.execute('CrossQueryEpisodeConsistency', EPISODE_QUERY, { id: episodeId });
    expectGraphQLSuccess(episodeResponse);
    const episode = episodeResponse.body.data?.episode as any;

    expectSubsetMatch(episode, episodeSeed, ['id', 'name', 'episode', 'air_date']);
    expect(episode.characters.map((entry: any) => entry.id)).toContain(character.id);
    const episodeCharacter = episode.characters.find((entry: any) => entry.id === character.id);
    expectSubsetMatch(episodeCharacter, character, ['id', 'name', 'status']);
    verifiedChecks += 3;
  } else {
    notes.push('Selected character did not expose a nested episode id, so episode consistency checks were skipped.');
  }

  return {
    workflow: 'crossQueryDataConsistency',
    verifiedChecks,
    notes,
    ids: {
      characterId: character.id,
      locationId,
      episodeId,
    },
  };
};
