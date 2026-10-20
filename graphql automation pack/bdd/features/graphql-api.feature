Feature: Rick and Morty GraphQL API automation
  The GraphQL automation pack should validate discovery-driven positive and negative scenarios.

  Scenario: Retrieve characters with pagination and filters
    When I query characters using the runtime filter data
    Then the latest GraphQL response is successful
    And the latest GraphQL response contains paginated characters

  Scenario: Retrieve a single character and multiple characters by ids
    When I query the runtime character id
    Then the latest GraphQL response is successful
    And the latest GraphQL response contains a nested character
    When I query the runtime character ids
    Then the latest GraphQL response is successful
    And the latest GraphQL response matches the requested character ids

  Scenario: Retrieve locations and episodes and chain nested ids dynamically
    When I query the runtime locations and episodes
    Then the stored GraphQL response "locations" is successful
    And the stored GraphQL response "episodes" is successful
    When I chain from the first discovered character to its location and first episode
    Then the stored GraphQL response "locationById" is successful
    And the stored GraphQL response "episodeById" is successful

  Scenario: Query a nonexistent id
    When I query a nonexistent character id
    Then the latest GraphQL response contains null data at "data.character"
    And the latest GraphQL response has no GraphQL errors

  Scenario: Validate GraphQL error behavior for invalid requests
    When I query an invalid GraphQL field
    Then the latest GraphQL response contains a GraphQL error including "Cannot query field"
    When I omit the mandatory character id argument
    Then the latest GraphQL response contains a GraphQL error including "required, but it was not provided"
    When I send an unsupported GraphQL mutation
    Then the latest GraphQL response contains a GraphQL error including "configured for mutations"

  @e2e-new
  Scenario: E2E: Character and episode consistency across separate queries
    When I run the character and episode consistency workflow
    Then the workflow summary "characterEpisodeConsistency" reports at least 4 verified checks

  @e2e-new
  Scenario: E2E: Location and resident consistency
    When I run the location and resident consistency workflow
    Then the workflow summary "locationResidentConsistency" reports at least 3 verified checks

  @e2e-new
  Scenario: E2E: Alias multi-query validation
    When I run the alias multi-query validation workflow
    Then the workflow summary "aliasMultiQueryValidation" reports at least 4 verified checks

  @e2e-new
  Scenario: E2E: Cross-resource relationship validation
    When I run the cross-resource relationship workflow
    Then the workflow summary "crossResourceRelationship" reports at least 2 verified checks

  @e2e-new
  Scenario: E2E: Fragment comparison validation
    When I run the fragment comparison workflow
    Then the workflow summary "fragmentWorkflow" reports at least 2 verified checks

  @e2e-new @generated-e2e
  Scenario: E2E: Cross-query data consistency
    When I run the cross-query data consistency workflow
    Then the workflow summary "crossQueryDataConsistency" reports at least 5 verified checks
