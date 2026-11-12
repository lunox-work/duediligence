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
 * The Jira wire contract. Two families of schema, not interchangeable:
 *
 * - `*ResponseSchema` (plus `tokenResponseSchema` and
 *   `accessibleResourceSchema`) describe what Atlassian sends. They require
 *   only what Jira guarantees and keep unknown keys (`.loose()`) at every
 *   level.
 * - `*DtoSchema` describe what we hand on to the API, the web app and the
 *   extension. They are flat and strict, use `null` where Jira left a value
 *   out, and drop unknown keys.
 */

/**
 * Removes every trailing "/" (U+002F) in one backwards scan, without a regex,
 * so an untrusted site URL is trimmed in linear time. Never throws.
 */
export function trimTrailingSlashes(value: string): string {
  throw new Error("not implemented");
}

/** Jira's three status categories plus our own "unknown". */
export const JIRA_STATUS_CATEGORIES = [
  "new",
  "indeterminate",
  "done",
  "unknown",
] as const;

/** One of `JIRA_STATUS_CATEGORIES`; anything else is refused, not mapped. */
export const jiraStatusCategorySchema = z.enum(JIRA_STATUS_CATEGORIES);

const jiraNameKeyResponseSchema = z
  .object({
    name: z.string().optional(),
    key: z.string().optional(),
  })
  .loose();

/** An issue as Atlassian sends it: only `id` and `key` are required. */
export const jiraIssueResponseSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    fields: z
      .object({
        summary: z.string().optional(),
        status: z
          .object({
            name: z.string().optional(),
            /** Kept as a free string; not checked against our categories. */
            statusCategory: z
              .object({
                key: z.string().optional(),
                name: z.string().optional(),
              })
              .loose()
              .optional(),
          })
          .loose()
          .optional(),
        assignee: z
          .object({ displayName: z.string().optional() })
          .loose()
          .nullish(),
        priority: jiraNameKeyResponseSchema.nullish(),
        issuetype: jiraNameKeyResponseSchema.optional(),
        project: jiraNameKeyResponseSchema.optional(),
        labels: z.array(z.string()).optional(),
        parent: z.object({ key: z.string().optional() }).loose().nullish(),
        created: z.string().nullish(),
        updated: z.string().nullish(),
        duedate: z.string().nullish(),
      })
      .loose()
      .optional(),
  })
  .loose();

/** A page of issues as Atlassian sends it; a missing `issues` is `[]`. */
export const jiraIssuePageResponseSchema = z
  .object({
    issues: z.array(jiraIssueResponseSchema).default([]),
    total: z.number().optional(),
    startAt: z.number().optional(),
    maxResults: z.number().optional(),
    nextPageToken: z.string().optional(),
  })
  .loose();

/** A board as Atlassian sends it: a numeric `id` and a `name` are required. */
export const jiraBoardResponseSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string().optional(),
    location: z
      .object({
        projectKey: z.string().optional(),
        projectName: z.string().optional(),
        displayName: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

/** A page of boards as Atlassian sends it; a missing `values` is `[]`. */
export const jiraBoardPageResponseSchema = z
  .object({
    values: z.array(jiraBoardResponseSchema).default([]),
    isLast: z.boolean().optional(),
    startAt: z.number().optional(),
    maxResults: z.number().optional(),
    total: z.number().optional(),
  })
  .loose();

/** A sprint as Atlassian sends it: a numeric `id` and a `name` are required. */
export const jiraSprintResponseSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    state: z.string().optional(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    goal: z.string().nullish(),
  })
  .loose();

/** A page of sprints as Atlassian sends it; a missing `values` is `[]`. */
export const jiraSprintPageResponseSchema = z
  .object({
    values: z.array(jiraSprintResponseSchema).default([]),
    isLast: z.boolean().optional(),
  })
  .loose();

/** Atlassian's OAuth token response: `access_token` and `expires_in` are required. */
export const tokenResponseSchema = z
  .object({
    access_token: z.string(),
    expires_in: z.number(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
  })
  .loose();

/** One entry of Atlassian's accessible-resources response; a missing `scopes` is `[]`. */
export const accessibleResourceSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    name: z.string(),
    avatarUrl: z.string().optional(),
    scopes: z.array(z.string()).default([]),
  })
  .loose();

/** A flat issue as we hand it on: every key present, `null` where Jira had nothing. */
export const jiraIssueDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  summary: z.string(),
  status: z.string(),
  statusCategory: jiraStatusCategorySchema,
  assignee: z.string().nullable(),
  priority: z.string().nullable(),
  issueType: z.string(),
  labels: z.array(z.string()),
  projectKey: z.string().nullable(),
  parentKey: z.string().nullable(),
  created: z.string().nullable(),
  updated: z.string().nullable(),
  dueDate: z.string().nullable(),
  url: z.string().nullable(),
});

/** A page of issue DTOs with optional cursors. */
export const jiraIssuePageDtoSchema = z.object({
  issues: z.array(jiraIssueDtoSchema),
  total: z.number().optional(),
  nextStartAt: z.number().optional(),
  nextPageToken: z.string().optional(),
});

/** A flat board as we hand it on. */
export const jiraBoardDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  projectKey: z.string().nullable(),
  projectName: z.string().nullable(),
});

/** A flat sprint as we hand it on. */
export const jiraSprintDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  goal: z.string().nullable(),
});

/** A Jira site as we hand it on; scopes are dropped. */
export const jiraSiteDtoSchema = z.object({
  cloudId: z.string(),
  url: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
});

export type JiraStatusCategory = z.infer<typeof jiraStatusCategorySchema>;
export type JiraIssueResponse = z.infer<typeof jiraIssueResponseSchema>;
export type JiraIssuePageResponse = z.infer<typeof jiraIssuePageResponseSchema>;
export type JiraBoardResponse = z.infer<typeof jiraBoardResponseSchema>;
export type JiraBoardPageResponse = z.infer<typeof jiraBoardPageResponseSchema>;
export type JiraSprintResponse = z.infer<typeof jiraSprintResponseSchema>;
export type JiraSprintPageResponse = z.infer<
  typeof jiraSprintPageResponseSchema
>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type AccessibleResource = z.infer<typeof accessibleResourceSchema>;
export type JiraIssueDto = z.infer<typeof jiraIssueDtoSchema>;
export type JiraIssuePageDto = z.infer<typeof jiraIssuePageDtoSchema>;
export type JiraBoardDto = z.infer<typeof jiraBoardDtoSchema>;
export type JiraSprintDto = z.infer<typeof jiraSprintDtoSchema>;
export type JiraSiteDto = z.infer<typeof jiraSiteDtoSchema>;

/** Build provenance: describes the artifact, not the data it serves. */
export * from "./build-info.js";
