# Let a narrower rule override a broader one
## Context
Admins can't carve out exceptions today: a deny on `tasks/**` beats every allow beneath it, so to open up one task they delete the deny and list every other task by hand instead.
## Change
When several rules match a request, the rule with the most specific resource pattern should decide, whether it allows or denies. Deny should still win when the matching rules are equally specific.
## Acceptance criteria
- An allow on `tasks/42` overrides a deny on `tasks/**` for a request on `tasks/42`, and the decision names the allow rule.
- An allow and a deny that are equally specific still give deny, whatever their order in the list.
## Scope
Only the resource pattern counts towards specificity; subject, action and conditions don't. Rule format, matching and validation stay as they are.
