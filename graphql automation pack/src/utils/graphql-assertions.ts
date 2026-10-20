import { expect } from '@playwright/test';

import { GraphQLExecutionResult } from '../clients/graphql-client';

export const getByPath = (value: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }

    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
};

export const expectGraphQLSuccess = (result: GraphQLExecutionResult): void => {
  expect(result.httpStatus).toBe(200);
  expect(result.body.errors ?? []).toEqual([]);
  expect(result.body.data).toBeTruthy();
};

export const expectGraphQLError = (result: GraphQLExecutionResult, expectedMessage: string): void => {
  expect([200, 400]).toContain(result.httpStatus);
  expect(result.body.errors?.length ?? 0).toBeGreaterThan(0);
  expect(JSON.stringify(result.body.errors)).toContain(expectedMessage);
};

export const expectPaginationConnection = (connection: any): void => {
  expect(connection).toEqual(
    expect.objectContaining({
      info: expect.objectContaining({
        count: expect.any(Number),
        pages: expect.any(Number),
      }),
      results: expect.any(Array),
    })
  );
};

export const expectCharacter = (character: any): void => {
  expect(character).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      status: expect.any(String),
      species: expect.any(String),
    })
  );
};

export const expectLocation = (location: any): void => {
  expect(location).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      type: expect.any(String),
      dimension: expect.any(String),
    })
  );
};

export const expectEpisode = (episode: any): void => {
  expect(episode).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      episode: expect.any(String),
    })
  );
};

export const pickFields = (value: any, fields: string[]): Record<string, unknown> => {
  return Object.fromEntries(fields.map((field) => [field, value?.[field]]));
};

export const expectSubsetMatch = (actual: any, expected: any, fields: string[]): void => {
  expect(pickFields(actual, fields)).toEqual(pickFields(expected, fields));
};
