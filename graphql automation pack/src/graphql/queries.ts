export const DISCOVER_QUERY_ROOT = `
query QueryRoot {
  __type(name: "Query") {
    fields {
      name
      args {
        name
        type {
          kind
          name
        }
      }
      type {
        kind
        name
      }
    }
  }
}
`;

export const DISCOVER_SCHEMA_CAPABILITIES = `
query SchemaCapabilities {
  __schema {
    queryType {
      name
    }
    mutationType {
      name
    }
    subscriptionType {
      name
    }
  }
}
`;

export const DISCOVER_FILTER_CHARACTER = `
query FilterCharacter {
  __type(name: "FilterCharacter") {
    inputFields {
      name
    }
  }
}
`;

export const DISCOVER_FILTER_LOCATION = `
query FilterLocation {
  __type(name: "FilterLocation") {
    inputFields {
      name
    }
  }
}
`;

export const DISCOVER_FILTER_EPISODE = `
query FilterEpisode {
  __type(name: "FilterEpisode") {
    inputFields {
      name
    }
  }
}
`;

export const DISCOVER_CHARACTER_TYPE = `
query CharacterType {
  __type(name: "Character") {
    fields {
      name
      type {
        kind
        name
      }
    }
  }
}
`;

export const DISCOVER_LOCATION_TYPE = `
query LocationType {
  __type(name: "Location") {
    fields {
      name
      type {
        kind
        name
      }
    }
  }
}
`;

export const DISCOVER_EPISODE_TYPE = `
query EpisodeType {
  __type(name: "Episode") {
    fields {
      name
      type {
        kind
        name
      }
    }
  }
}
`;

export const CHARACTERS_QUERY = `
query Characters($page: Int, $filter: FilterCharacter) {
  characters(page: $page, filter: $filter) {
    info {
      count
      pages
      next
      prev
    }
    results {
      id
      name
      status
      species
      type
      gender
      image
      created
    }
  }
}
`;

export const CHARACTER_QUERY = `
query Character($id: ID!) {
  character(id: $id) {
    id
    name
    status
    species
    type
    gender
    image
    created
    origin {
      id
      name
      type
      dimension
      created
    }
    location {
      id
      name
      type
      dimension
      created
    }
    episode {
      id
      name
      episode
      air_date
      created
    }
  }
}
`;

export const CHARACTER_SELECTION_QUERY = `
query CharacterSelection($id: ID!) {
  character(id: $id) {
    id
    name
  }
}
`;

export const CHARACTERS_RELATION_SCAN_QUERY = `
query CharactersRelationScan($page: Int) {
  characters(page: $page) {
    info {
      count
      pages
      next
      prev
    }
    results {
      id
      name
      origin {
        id
        name
      }
      location {
        id
        name
      }
    }
  }
}
`;

export const CHARACTERS_BY_IDS_QUERY = `
query CharactersByIds($ids: [ID!]!) {
  charactersByIds(ids: $ids) {
    id
    name
    status
    species
  }
}
`;

export const LOCATIONS_QUERY = `
query Locations($page: Int, $filter: FilterLocation) {
  locations(page: $page, filter: $filter) {
    info {
      count
      pages
      next
      prev
    }
    results {
      id
      name
      type
      dimension
      created
      residents {
        id
        name
      }
    }
  }
}
`;

export const LOCATION_QUERY = `
query Location($id: ID!) {
  location(id: $id) {
    id
    name
    type
    dimension
    created
    residents {
      id
      name
      species
    }
  }
}
`;

export const EPISODES_QUERY = `
query Episodes($page: Int, $filter: FilterEpisode) {
  episodes(page: $page, filter: $filter) {
    info {
      count
      pages
      next
      prev
    }
    results {
      id
      name
      episode
      air_date
      created
      characters {
        id
        name
      }
    }
  }
}
`;

export const EPISODE_QUERY = `
query Episode($id: ID!) {
  episode(id: $id) {
    id
    name
    episode
    air_date
    created
    characters {
      id
      name
      status
    }
  }
}
`;

export const ALIAS_MULTI_RESOURCE_QUERY = `
query AliasMultiResource($characterId: ID!, $locationId: ID!, $episodeId: ID!) {
  characterAlias: character(id: $characterId) {
    id
    name
    status
    species
  }
  locationAlias: location(id: $locationId) {
    id
    name
    type
    dimension
  }
  episodeAlias: episode(id: $episodeId) {
    id
    name
    episode
    air_date
  }
}
`;

export const FRAGMENT_COMPARISON_QUERY = `
query FragmentComparison($characterId: ID!, $locationId: ID!) {
  character(id: $characterId) {
    ...CharacterCoreFields
  }
  location(id: $locationId) {
    ...LocationCoreFields
  }
}

fragment CharacterCoreFields on Character {
  id
  name
  status
  species
  origin {
    id
    name
  }
  location {
    id
    name
  }
}

fragment LocationCoreFields on Location {
  id
  name
  type
  dimension
}
`;

export const FRAGMENT_COMPARISON_BASELINE_QUERY = `
query FragmentComparisonBaseline($characterId: ID!, $locationId: ID!) {
  character(id: $characterId) {
    id
    name
    status
    species
    origin {
      id
      name
    }
    location {
      id
      name
    }
  }
  location(id: $locationId) {
    id
    name
    type
    dimension
  }
}
`;

export const INVALID_FIELD_QUERY = `
query InvalidField {
  characters {
    results {
      id
      invalidField
    }
  }
}
`;

export const OMIT_REQUIRED_ARGUMENT_QUERY = `
query MissingCharacterId {
  character {
    id
    name
  }
}
`;

export const UNSUPPORTED_MUTATION_QUERY = `
mutation UnsupportedMutation {
  createCharacter(name: "Rick") {
    id
  }
}
`;

export const UNSUPPORTED_SUBSCRIPTION_QUERY = `
subscription UnsupportedSubscription {
  character(id: "1") {
    id
  }
}
`;
