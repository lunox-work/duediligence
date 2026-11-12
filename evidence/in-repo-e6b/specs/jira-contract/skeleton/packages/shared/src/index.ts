/**
 * The wire contract. The API parses with these schemas on the way out and the
 * client on the way in, so a shape change breaks the build, not a consumer at
 * runtime.
 *
 * Depends on zod only, so the extension and the browser can both bundle it.
 */

import {
  TITLE_MAX_LENGTH,
  TODO_FILTERS,
  normalizeHandle,
} from "sandbox-factory";
import { z } from "zod";

/** Derived from the core constants, so a cap changed in core applies here. */
export const titleSchema = z
  .string()
  .trim()
  .min(1, "A todo needs a title.")
  .max(
    TITLE_MAX_LENGTH,
    `Titles are capped at ${TITLE_MAX_LENGTH} characters.`,
  );

export const todoFilterSchema = z.enum(TODO_FILTERS);

/**
 * A public handle: a username or an organization slug. Refines rather than
 * restates, so the core rules are the only definition, and transforms to the
 * stored (lowercase) form so a handler never sees the raw casing.
 *
 * The message is core's, which is subject-free ("Must be between…"): callers
 * that report the field name separately read correctly, and zod prefixes the
 * path itself in a fielded error.
 */
export const handleSchema = z
  .string()
  .transform((raw) => normalizeHandle(raw))
  .superRefine((result, ctx) => {
    if (result.status === "invalid") {
      ctx.addIssue({ code: "custom", message: result.reason });
    }
  })
  // Unreachable when invalid: `superRefine` has already failed the parse, so
  // this only ever runs on the `ok` branch. The fallback keeps the type
  // narrow without an assertion.
  .transform((result) => (result.status === "ok" ? result.handle : ""));

export const todoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const todoListSchema = z.object({
  todos: z.array(todoSchema),
});

/** Body for `POST /api/v1/todos`. */
export const createTodoSchema = z.object({
  title: titleSchema,
});

/**
 * Body for `PATCH /api/v1/todos/:id`. Both fields are optional, but an empty
 * body is rejected: it almost always means the caller sent the wrong shape.
 */
export const updateTodoSchema = z
  .object({
    title: titleSchema.optional(),
    done: z.boolean().optional(),
  })
  .refine((body) => body.title !== undefined || body.done !== undefined, {
    message: "Provide a title, a done flag, or both.",
  });

/**
 * Organizations. The membership shape the sidebar and the account page read;
 * `role` is the plugin's, one of owner, admin or member.
 */
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;

export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);

export const organizationSummarySchema = z.object({
  /** Permanent. What anything durable references. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** The public handle. Unique but renameable: never a foreign key. */
  slug: z.string().min(1),
});

export const membershipSchema = organizationSummarySchema.extend({
  role: organizationRoleSchema,
});

export const membershipListSchema = z.object({
  organizations: z.array(membershipSchema),
});

/** A member of one organization, joined with the handle the user shows. */
export const organizationMemberSchema = z.object({
  /** The `member` row id, which is what remove and role changes take. */
  id: z.string().min(1),
  userId: z.string().min(1),
  role: organizationRoleSchema,
  name: z.string(),
  username: z.string().nullable(),
  image: z.string().nullable(),
});

export const organizationMemberListSchema = z.object({
  members: z.array(organizationMemberSchema),
});

/** A pending invitation, as its recipient sees it. */
export const pendingInvitationSchema = z.object({
  id: z.string().min(1),
  organization: organizationSummarySchema,
  role: organizationRoleSchema,
  expiresAt: z.iso.datetime(),
});

export const pendingInvitationListSchema = z.object({
  invitations: z.array(pendingInvitationSchema),
});

/**
 * Body for `POST /api/v1/orgs/:orgId/invitations`. Exactly one of `handle` or
 * `email`: inviting by handle is the common case inside the product, and by
 * address is how someone with no account yet is reached.
 */
export const inviteMemberSchema = z
  .object({
    handle: handleSchema.optional(),
    email: z.email().optional(),
    role: organizationRoleSchema.default("member"),
  })
  .refine(
    (body) => (body.handle === undefined) !== (body.email === undefined),
    { message: "Provide either a handle or an email address, not both." },
  );

export const errorSchema = z.object({
  error: z.string(),
});

export type TodoDto = z.infer<typeof todoSchema>;
export type TodoListDto = z.infer<typeof todoListSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type ErrorDto = z.infer<typeof errorSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type OrganizationSummaryDto = z.infer<typeof organizationSummarySchema>;
export type MembershipDto = z.infer<typeof membershipSchema>;
export type MembershipListDto = z.infer<typeof membershipListSchema>;
export type OrganizationMemberDto = z.infer<typeof organizationMemberSchema>;
export type PendingInvitationDto = z.infer<typeof pendingInvitationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Jira. The wire contract for connections, boards and issues, and the one
 * shared helper that removes trailing slashes from a Jira site URL.
 */

/** Removes every trailing "/" (U+002F) in one backwards scan. Never throws. */
export function trimTrailingSlashes(value: string): string {
  throw new Error("not implemented");
}

/** The single message for any refused Jira site URL. */
export const JIRA_SITE_URL_MESSAGE =
  "A Jira site URL must be an https URL with no query or fragment.";

/**
 * An https Jira site URL. Trimmed of whitespace, validated, trailing slashes
 * removed. The output is the trimmed input, not a re-serialised URL; every
 * refusal uses `JIRA_SITE_URL_MESSAGE`.
 */
export const jiraSiteUrlSchema: z.ZodType<string, string> = z
  .string()
  .transform((value: string): string => {
    throw new Error("not implemented");
  });

/** How a Jira connection authenticates. */
export const JIRA_AUTH_METHODS = ["oauth", "api_token"] as const;

export const jiraAuthMethodSchema = z.enum(JIRA_AUTH_METHODS);

export type JiraAuthMethod = (typeof JIRA_AUTH_METHODS)[number];

/** Jira's three status categories; its `undefined` category is refused. */
export const JIRA_STATUS_CATEGORIES = ["new", "indeterminate", "done"] as const;

export const jiraStatusCategorySchema = z.enum(JIRA_STATUS_CATEGORIES);

export type JiraStatusCategory = (typeof JIRA_STATUS_CATEGORIES)[number];

/** The message for an issue key that does not look like PROJ-123. */
export const JIRA_ISSUE_KEY_MESSAGE = "A Jira issue key looks like PROJ-123.";

/** A Jira connection. Unknown keys are dropped, so a leaked secret never reaches the wire. */
export const jiraConnectionSchema = z.object({
  /** A `jrc_…` id; the prefix is not checked. */
  id: z.string().min(1),
  siteUrl: jiraSiteUrlSchema,
  siteName: z.string().min(1),
  authMethod: jiraAuthMethodSchema,
  createdAt: z.iso.datetime(),
});

export const jiraConnectionListSchema = z.object({
  connections: z.array(jiraConnectionSchema),
});

/** Body for `POST /api/v1/jira/connections`. */
export const connectJiraApiTokenSchema = z.object({
  siteUrl: jiraSiteUrlSchema,
  email: z.email(),
  apiToken: z.string().trim().min(1, "Provide the API token."),
});

/** A Jira board belonging to a connection. */
export const jiraBoardSchema = z.object({
  /** A `jrb_…` id; the prefix is not checked. */
  id: z.string().min(1),
  connectionId: z.string().min(1),
  name: z.string().min(1),
});

export const jiraBoardListSchema = z.object({
  boards: z.array(jiraBoardSchema),
});

/** A Jira issue whose key is PROJECT-NUMBER and whose status category is one of Jira's three. */
export const jiraIssueSchema = z.object({
  /** A `jri_…` id; the prefix is not checked. */
  id: z.string().min(1),
  boardId: z.string().min(1),
  key: z.string().regex(/^[A-Z][A-Z0-9_]*-[0-9]+$/, JIRA_ISSUE_KEY_MESSAGE),
  summary: z.string().min(1),
  /** The workflow's own status name. */
  status: z.string().min(1),
  statusCategory: jiraStatusCategorySchema,
  /** Display name, `null` when unassigned. */
  assignee: z.string().nullable(),
  url: z.url(),
  updatedAt: z.iso.datetime(),
});

export const jiraIssueListSchema = z.object({
  issues: z.array(jiraIssueSchema),
});

export type JiraConnectionDto = z.infer<typeof jiraConnectionSchema>;
export type JiraConnectionListDto = z.infer<typeof jiraConnectionListSchema>;
export type ConnectJiraApiTokenInput = z.infer<typeof connectJiraApiTokenSchema>;
export type JiraBoardDto = z.infer<typeof jiraBoardSchema>;
export type JiraBoardListDto = z.infer<typeof jiraBoardListSchema>;
export type JiraIssueDto = z.infer<typeof jiraIssueSchema>;
export type JiraIssueListDto = z.infer<typeof jiraIssueListSchema>;

/** Build provenance: describes the artifact, not the data it serves. */
export * from "./build-info.js";
