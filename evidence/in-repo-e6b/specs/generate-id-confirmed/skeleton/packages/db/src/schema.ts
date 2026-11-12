/**
 * Drizzle schema barrel. The tables live in `./schema/auth.ts`,
 * `./schema/organizations.ts` and `./schema/todos.ts`; this file re-exports
 * them under the same names so every importer, and `drizzle.config.ts`, keeps
 * reading `./src/schema.ts` unchanged. It defines no tables of its own.
 */

export {
  account,
  session,
  user,
  userEmail,
  verification,
} from "./schema/auth.js";
export type {
  AccountRow,
  NewUserEmailRow,
  SessionRow,
  UserEmailRow,
  UserRow,
  VerificationRow,
} from "./schema/auth.js";
export { invitation, member, organization } from "./schema/organizations.js";
export type {
  InvitationRow,
  MemberRow,
  NewMemberRow,
  NewOrganizationRow,
  OrganizationRow,
} from "./schema/organizations.js";
export { todos } from "./schema/todos.js";
export type { NewTodoRow, TodoRow } from "./schema/todos.js";
