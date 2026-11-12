# feat(db): generalise generateId and split the schema into modules (#26)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/db/src/mapping.ts`:

```ts
export const ID_PREFIXES = [
    "todo",
    "jrc",
    "jrb",
    "jri",
    "brn",
    "bpr",
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

export function generateId(prefix: IdPrefix = "todo"): string;
```

In `packages/db/src/schema/auth.ts`:

```ts
export const user = …;

export const userEmail = …;

export const session = …;

export const account = …;

export const verification = …;

export type UserRow = typeof user.$inferSelect;

export type UserEmailRow = typeof userEmail.$inferSelect;

export type NewUserEmailRow = typeof userEmail.$inferInsert;

export type SessionRow = typeof session.$inferSelect;

export type AccountRow = typeof account.$inferSelect;

export type VerificationRow = typeof verification.$inferSelect;
```

In `packages/db/src/schema/organizations.ts`:

```ts
export const organization = …;

export const member = …;

export const invitation = …;

export type OrganizationRow = typeof organization.$inferSelect;

export type NewOrganizationRow = typeof organization.$inferInsert;

export type MemberRow = typeof member.$inferSelect;

export type NewMemberRow = typeof member.$inferInsert;

export type InvitationRow = typeof invitation.$inferSelect;
```

In `packages/db/src/schema/todos.ts`:

```ts
export const todos = …;

export type TodoRow = typeof todos.$inferSelect;

export type NewTodoRow = typeof todos.$inferInsert;
```
