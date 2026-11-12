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

import { z } from "zod";

/**
 * Removes every trailing "/" (U+002F) in one backwards scan, without a regex,
 * so an untrusted site URL is trimmed in linear time. Never throws.
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) {
    end -= 1;
  }
  return value.slice(0, end);
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
