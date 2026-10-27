# Anonymised project names

Public copies of a task need names like `project-7f3a` that say nothing about
whose code it is. The name is derived from the task id with a keyed hash, so
the same task always gets the same name and nobody without the key can work
backwards from a name to a task.

```gherkin
Feature: Name each task's public project

  Background:
    Given each organization has its own registry of names
    And each registry is created with a secret key
    And a task's digest is HMAC-SHA256 of its task id under the key, as lowercase hex

  @happy
  Scenario: A task's name is "project-" and the first four digest characters
    Given a registry with key "org-secret"
    When task "task-1" is named
    Then its name is "project-63a9"

  @happy
  Scenario: The same task always gets the same name
    Given a registry with key "org-secret"
    And task "task-1" has been named
    When task "task-1" is named again
    Then its name is "project-63a9"

  @boundary
  Scenario: A collision within an organization gets a longer suffix
    Given a registry with key "org-secret"
    And task "task-81" has been named "project-139a"
    When task "task-136" is named
    Then its name is "project-139a1f"
    And that is because its first four digest characters are taken, and the suffix grows two characters at a time until the name is free

  @boundary
  Scenario: The task named first keeps its name
    Given a registry with key "org-secret"
    And task "task-81" has been named, then task "task-136"
    When task "task-81" is named again
    Then its name is still "project-139a"

  @boundary
  Scenario: Different organizations may hold the same name
    Given two registries, each with key "org-secret"
    And task "task-81" has been named in the first
    When task "task-136" is named in the second
    Then its name is "project-139a"

  @unhappy
  Scenario: A registry needs a key
    When a registry is created with an empty key
    Then it fails with an error

  @unhappy
  Scenario: A task needs an id
    Given a registry with key "org-secret"
    When a task with an empty id is named
    Then it fails with an error
```
