/**
 * The GitHub wire contract: GitHub App installations and repository pointers.
 *
 * Three families of schema live here, as in `jira.ts`, and they are not
 * interchangeable:
 *
 * - `*ResponseSchema` and `*EventSchema` describe what **GitHub sends** (REST
 *   responses and webhook deliveries). They are permissive: only what GitHub
 *   always sends is required, and `.loose()` keeps an unknown field rather
 *   than failing the parse.
 * - `*DtoSchema` describes what **we hand on** to the web app. Those are
 *   strict (`z.strictObject`): every field is required and an unknown key is
 *   refused. Their strings carry no format check, because we produce them.
 * - `*RequestSchema` is a body **our own clients send**: `z.object`, so unknown
 *   keys are stripped, and ids must be GitHub id text.
 *
 * A repository pointer is keyed by GitHub's permanent id (`externalId`);
 * `fullName` is only the name last seen, since repositories are renamed and
 * transferred.
 *
 * Everything here is pure: no clock, network, storage or shared state.
 */

import { z } from "zod";

/** One installation, as GitHub sends it. Only `id` is required. */
export const githubInstallationResponseSchema = z
  .object({
    id: z.number().int(),
    account: z
      .object({
        login: z.string(),
        id: z.number().optional(),
        type: z.string().optional(),
      })
      .loose()
      .nullable()
      .optional(),
    repository_selection: z.string().optional(),
    permissions: z.record(z.string(), z.string()).optional(),
    suspended_at: z.string().nullable().optional(),
  })
  .loose();

/** A page of installations: `{ total_count?, installations: [...] }`. */
export const githubInstallationPageResponseSchema = z
  .object({
    total_count: z.number().optional(),
    installations: z.array(githubInstallationResponseSchema),
  })
  .loose();

/** One repository, as GitHub sends it. Only `id` and `full_name` are required. */
export const githubRepositoryResponseSchema = z
  .object({
    id: z.number().int(),
    full_name: z.string(),
    private: z.boolean().optional(),
    default_branch: z.string().optional(),
    /** Kilobytes. */
    size: z.number().optional(),
    /** An ISO string or Unix seconds. */
    pushed_at: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .loose();

/**
 * A page of repositories. `repositories` is required, with no default, and
 * keeps the order GitHub sent.
 */
export const githubRepositoryPageResponseSchema = z
  .object({
    total_count: z.number().optional(),
    repository_selection: z.string().optional(),
    repositories: z.array(githubRepositoryResponseSchema),
  })
  .loose();

/** `GET /user`. */
export const githubUserResponseSchema = z
  .object({
    login: z.string(),
    id: z.number().int(),
  })
  .loose();

/** `GET /repos/{o}/{r}/git/ref/heads/{branch}`. */
export const githubRefResponseSchema = z
  .object({
    ref: z.string().optional(),
    object: z.object({ sha: z.string() }).loose(),
  })
  .loose();

/** `POST /app/installations/{id}/access_tokens`. */
export const githubInstallationTokenResponseSchema = z
  .object({
    token: z.string().min(1),
    expires_at: z.string(),
  })
  .loose();

/** `POST https://github.com/login/oauth/access_token`. Every field optional. */
export const githubOAuthTokenResponseSchema = z
  .object({
    access_token: z.string().min(1).optional(),
    refresh_token: z.string().min(1).optional(),
    expires_in: z.number().optional(),
    refresh_token_expires_in: z.number().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .loose();

/** What every webhook delivery carries: `{ action?, installation?: { id } }`. */
export const githubWebhookEnvelopeSchema = z
  .object({
    action: z.string().optional(),
    installation: z.object({ id: z.number().int() }).loose().optional(),
  })
  .loose();

/** The `installation` webhook event. */
export const githubInstallationEventSchema = z
  .object({
    action: z.string(),
    installation: githubInstallationResponseSchema,
  })
  .loose();

/** The `installation_repositories` webhook event. */
export const githubInstallationRepositoriesEventSchema = z
  .object({
    action: z.string(),
    installation: githubInstallationResponseSchema,
    repository_selection: z.string().optional(),
    repositories_added: z
      .array(
        z
          .object({ id: z.number().int(), full_name: z.string().optional() })
          .loose(),
      )
      .optional(),
    repositories_removed: z
      .array(
        z
          .object({ id: z.number().int(), full_name: z.string().optional() })
          .loose(),
      )
      .optional(),
  })
  .loose();

/** The `push` webhook event. */
export const githubPushEventSchema = z
  .object({
    ref: z.string(),
    after: z.string(),
    deleted: z.boolean().optional(),
    repository: githubRepositoryResponseSchema,
    installation: z.object({ id: z.number().int() }).loose().optional(),
  })
  .loose();

/** The `repository` webhook event. */
export const githubRepositoryEventSchema = z
  .object({
    action: z.string(),
    repository: githubRepositoryResponseSchema,
    changes: z
      .object({
        default_branch: z.object({ from: z.string() }).loose().optional(),
      })
      .loose()
      .optional(),
    installation: z.object({ id: z.number().int() }).loose().optional(),
  })
  .loose();

/** The webhook request headers GitHub sends, by role. */
export const GITHUB_WEBHOOK_HEADERS = {
  event: "x-github-event",
  delivery: "x-github-delivery",
  signature: "x-hub-signature-256",
} as const;

/**
 * An ISO string from GitHub's ISO-string or Unix-seconds timestamps, or null
 * for anything else.
 */
export function githubTimestamp(
  value: string | number | null | undefined,
): string | null {
  let ms: number;
  if (typeof value === "number") ms = value * 1000;
  else if (typeof value === "string" && value !== "") ms = Date.parse(value);
  else return null;
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A registered repository's role. Only `source` for now. */
export const GITHUB_REPO_ROLES = ["source"] as const;

export const githubRepoRoleSchema = z.enum(GITHUB_REPO_ROLES);

/** A registered repository's sync status. */
export const GITHUB_SYNC_STATUSES = ["pending", "ok", "error", "gone"] as const;

export const githubSyncStatusSchema = z.enum(GITHUB_SYNC_STATUSES);

/** An installation the person can see, as it stands for their organization. */
export const GITHUB_INSTALLATION_STATUSES = [
  "linked",
  "claimed",
  "free",
  "not-authorized",
  "unavailable",
] as const;

/** How the connect callback ends. */
export const GITHUB_CONNECT_OUTCOMES = [
  "connected",
  "pick",
  "cancelled",
  "state",
  "forbidden",
  "not-visible",
  "claimed",
  "not-authorized",
  "unavailable",
  "denied",
  "error",
] as const;

export const githubConnectOutcomeSchema = z.enum(GITHUB_CONNECT_OUTCOMES);

/** One installation linked to an organization. */
export const githubConnectionDtoSchema = z.strictObject({
  /** Our row id. */
  id: z.string(),
  /** GitHub's installation id as text. */
  installationId: z.string(),
  accountLogin: z.string(),
  /** GitHub's casing, e.g. `Organization`, `User`. */
  accountType: z.string(),
  repositorySelection: z.string(),
  healthy: z.boolean(),
  suspendedAt: z.string().nullable(),
  uninstalledAt: z.string().nullable(),
  settingsUrl: z.string(),
  createdAt: z.string(),
});

/** The signed-in person's own GitHub grant: the login and health, never tokens. */
export const githubGrantDtoSchema = z.strictObject({
  githubLogin: z.string(),
  healthy: z.boolean(),
});

/** An installation the person can see. */
export const githubAvailableInstallationDtoSchema = z.strictObject({
  installationId: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
  repositorySelection: z.string(),
  status: z.enum(GITHUB_INSTALLATION_STATUSES),
});

/** A repository an installation can see. */
export const githubInstallationRepositoryDtoSchema = z.strictObject({
  /** GitHub's repository id as text. */
  externalId: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  isPrivate: z.boolean(),
  /** The registered row's id, if registered. */
  registeredId: z.string().nullable(),
});

/**
 * A registered repository: the pointer. Keyed by GitHub's permanent id
 * (`externalId`); `fullName` is only the name last seen.
 */
export const githubRepoDtoSchema = z.strictObject({
  /** Our row id. */
  id: z.string(),
  /** Our connection row id, not GitHub's number. */
  connectionId: z.string(),
  role: githubRepoRoleSchema,
  /** GitHub's repository id as text. */
  externalId: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  isPrivate: z.boolean(),
  sizeKb: z.number().nullable(),
  headSha: z.string().nullable(),
  pushedAt: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  syncStatus: githubSyncStatusSchema,
  syncError: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * GitHub id text: 1 to 19 decimal digits with no leading zero, kept as a
 * string. No safe-integer cap, and nothing is trimmed or normalised.
 */
const githubIdTextSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/, "Expected a GitHub id.");

/**
 * Body for `POST .../github/connections/:id/repositories`: GitHub's
 * repository id as GitHub id text, and its role.
 */
export const registerRepoRequestSchema = z.object({
  externalId: githubIdTextSchema,
  role: githubRepoRoleSchema,
});

/** Body for `POST .../github/connections`: GitHub's installation id as text. */
export const linkInstallationRequestSchema = z.object({
  installationId: githubIdTextSchema,
});

/** The installation's settings page on GitHub, for the account type. */
export function githubInstallationSettingsUrl(
  accountType: string,
  accountLogin: string,
  installationId: string,
): string {
  return accountType === "Organization"
    ? `https://github.com/organizations/${accountLogin}/settings/installations/${installationId}`
    : `https://github.com/settings/installations/${installationId}`;
}

export type GithubInstallationResponse = z.infer<
  typeof githubInstallationResponseSchema
>;
export type GithubRepositoryResponse = z.infer<
  typeof githubRepositoryResponseSchema
>;
export type GithubUserResponse = z.infer<typeof githubUserResponseSchema>;
export type GithubInstallationEvent = z.infer<
  typeof githubInstallationEventSchema
>;
export type GithubInstallationRepositoriesEvent = z.infer<
  typeof githubInstallationRepositoriesEventSchema
>;
export type GithubPushEvent = z.infer<typeof githubPushEventSchema>;
export type GithubRepositoryEvent = z.infer<typeof githubRepositoryEventSchema>;
export type GithubRepoRole = z.infer<typeof githubRepoRoleSchema>;
export type GithubSyncStatus = z.infer<typeof githubSyncStatusSchema>;
export type GithubConnectionDto = z.infer<typeof githubConnectionDtoSchema>;
export type GithubGrantDto = z.infer<typeof githubGrantDtoSchema>;
export type GithubAvailableInstallationDto = z.infer<
  typeof githubAvailableInstallationDtoSchema
>;
export type GithubInstallationRepositoryDto = z.infer<
  typeof githubInstallationRepositoryDtoSchema
>;
export type GithubRepoDto = z.infer<typeof githubRepoDtoSchema>;
export type RegisterRepoRequest = z.infer<typeof registerRepoRequestSchema>;
export type LinkInstallationRequest = z.infer<
  typeof linkInstallationRequestSchema
>;
export type GithubConnectOutcome = z.infer<typeof githubConnectOutcomeSchema>;
