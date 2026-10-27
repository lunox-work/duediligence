# Decide who may do what

Every request to the platform is checked against a list of access rules.
Rules name who, what and which resource, with wildcards, and may carry
conditions on the request. The most specific matching rule decides, deny
beats an equally specific allow, and nothing is allowed that no rule
allows.

```gherkin
Feature: Evaluate access rules

  Background:
    Given a list of rules, each with an id, an effect "allow" or "deny", a subject pattern, an action pattern, a resource pattern, and a list of conditions
    And a request with a subject id, a list of roles, an action, a resource, and attributes: a map of string names to string values
    And a resource is segments joined by "/"; a resource pattern is the same, where a segment "*" matches exactly one segment and "**" matches any number of segments, including none
    And an action pattern is an exact action, or a prefix ending in "*" that matches any action starting with the prefix, or "*" alone
    And a subject pattern is a subject id, or "role:" followed by a role name, or "*"
    And a condition names an attribute, an operator "eq", "neq", "in" or "absent", and a value, or a list of values for "in"
    And evaluating returns a decision: the effect, and the id of the rule that decided it, or no id when no rule matched

  Rule: A rule matches when all its parts match

    @happy
    Scenario: An exact rule allows a request
      Given a rule allowing subject "u1", action "read", resource "tasks/42"
      When "u1" asks to "read" "tasks/42"
      Then the decision is "allow" by that rule

    @happy
    Scenario: A role matches when the request lists it
      Given a rule allowing "role:reviewer" to "read" "tasks/**"
      When a subject with roles ["reviewer"] asks to "read" "tasks/42/submissions/7"
      Then the decision is "allow" by that rule
      And the same request without that role is denied with no rule

    @boundary
    Scenario: Resource wildcards match by segment
      Given a rule allowing "*" to "read" "tasks/*/submissions"
      When the resource is "tasks/42/submissions"
      Then it matches
      And "tasks/42/43/submissions", "tasks/submissions" and "tasks/42/submissions/7" do not
      And a pattern "tasks/**" matches "tasks", "tasks/42" and "tasks/42/submissions/7"
      And a pattern "**/submissions" matches "submissions" and "tasks/42/submissions"

    @boundary
    Scenario: Action prefixes match whole actions
      Given a rule for action "task:*"
      When the action is "task:read" or "task:" it matches
      And when the action is "task" or "tasks:read" it does not
      And a pattern "read" matches "read" alone, and "*" matches any action

    @boundary
    Scenario: Matching is case-sensitive and exact
      Given a rule allowing "role:Admin" to "Read" "Tasks/**"
      When a subject with role "admin" asks to "read" "tasks/42"
      Then the decision is deny with no rule
      And a resource with a trailing slash, "tasks/42/", is not the resource "tasks/42"

  Rule: The most specific matching rule decides, deny breaks ties, and no match denies

    @happy
    Scenario: A more specific allow overrides a broader deny
      Given a deny rule for "*" on "tasks/**" and an allow rule for "u1" on "tasks/42", in that order
      When "u1" asks to "read" "tasks/42"
      Then the decision is "allow" by the allow rule
      And when "u1" asks to "read" "tasks/43" the decision is "deny" by the deny rule
      And when the two rules are given in the other order the decisions are the same

    @happy
    Scenario: A more specific deny overrides a broader allow
      Given an allow rule for "role:reviewer" on "tasks/**" and a deny rule for "u1" on "tasks/42", in that order
      When "u1" with role "reviewer" asks to "read" "tasks/42"
      Then the decision is "deny" by the deny rule
      And when the two rules are given in the other order the decision is the same

    @boundary
    Scenario: Specificity is the number of literal segments in the resource pattern
      Given a rule's specificity is the number of segments in its resource pattern that are neither "*" nor "**"
      When a deny rule on "tasks/**" and an allow rule on "tasks/*/submissions" both match "tasks/42/submissions"
      Then the decision is "allow" by the allow rule, because 2 literal segments beat 1
      And a deny rule on "tasks/42/**" and an allow rule on "tasks/*/submissions" are equally specific, so the decision is "deny" by the deny rule
      And a deny rule on "**" and an allow rule on "*" are equally specific for "tasks", with 0 literal segments each, so the decision is "deny" by the deny rule

    @boundary
    Scenario: Subject, action and conditions do not add to specificity
      Given a deny rule for "u1" on action "read" on "tasks/**" with condition "region" eq "sg"
      And an allow rule for "*" on action "*" on "tasks/42" with no conditions
      When "u1" asks to "read" "tasks/42" with region "sg"
      Then the decision is "allow" by the allow rule

    @boundary
    Scenario: Among equally specific matching rules, deny beats allow
      Given an allow rule for "u1" on "tasks/*" and a deny rule for "role:reviewer" on "*/42", in that order
      When "u1" with role "reviewer" asks to "read" "tasks/42"
      Then the decision is "deny" by the deny rule
      And when the two rules are given in the other order the decision is the same

    @boundary
    Scenario: Among several equally specific matching rules of the deciding effect, the first in the list decides
      Given two deny rules and one allow rule that all match a request with the same specificity
      When the request is evaluated
      Then the decision is "deny" by the deny rule that comes first in the list
      And when only allow rules match, the first of the most specific of them is reported
      And a less specific rule earlier in the list never decides over a more specific one later in the list

    @unhappy
    Scenario: No matching rule denies
      Given rules none of which match the request
      When the request is evaluated
      Then the decision is "deny" with no rule id
      And an empty list of rules denies every request

  Rule: Conditions narrow a rule

    @happy
    Scenario: Every condition must hold
      Given an allow rule with conditions "region" eq "sg" and "tier" in ["gold", "platinum"]
      When the request's attributes are region "sg" and tier "gold" the rule matches
      And when tier is "silver" the rule does not match

    @boundary
    Scenario: A missing attribute fails every operator but "absent"
      Given rules with one condition each: "region" eq "sg", "region" neq "sg", "region" in ["sg"], and "region" absent
      When the request has no "region" attribute
      Then only the "absent" rule matches
      And when the request has region "us", the "neq" rule matches and the "absent" rule does not

    @unhappy
    Scenario: A rule with an unknown operator or effect is refused
      Given a rule whose condition operator is not one of the four, or whose effect is neither "allow" nor "deny"
      When any request is evaluated against the list
      Then evaluation fails with an error naming the rule's id
```
