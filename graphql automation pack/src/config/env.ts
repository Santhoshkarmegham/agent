import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type EnvironmentConfig = {
  envName: string;
  baseURL: string;
  graphqlPath: string;
};

const readEnvironmentFile = (envName: string): Partial<EnvironmentConfig> => {
  const envFile = path.resolve(__dirname, '../../config/environments', `${envName}.json`);
  if (!existsSync(envFile)) {
    return {};
  }

  return JSON.parse(readFileSync(envFile, 'utf-8')) as Partial<EnvironmentConfig>;
};

export const loadEnvironmentConfig = (): EnvironmentConfig => {
  const envName = process.env.TEST_ENV || 'qa';
  const fileConfig = readEnvironmentFile(envName);

  return {
    envName,
    baseURL: process.env.API_BASE_URL || fileConfig.baseURL || 'https://rickandmortyapi.com',
    graphqlPath: process.env.GRAPHQL_PATH || fileConfig.graphqlPath || '/graphql',
  };
};
