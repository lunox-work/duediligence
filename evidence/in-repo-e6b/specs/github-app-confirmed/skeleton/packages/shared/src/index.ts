/**
 * The wire contract. The API parses with these schemas on the way out and the
 * client on the way in, so a shape change breaks the build, not a consumer at
 * runtime.
 *
 * Depends on zod only, so the extension and the browser can both bundle it.
 */

import { normalizeHandle } from "sandbox-factory";
import { z } from "zod";

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

/**
 * Organizations. The membership shape the sidebar and the account page read;
 * `role` is the plugin's, one of owner, admin or member.
 */
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;

export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES);

/**
 * What an organization is: one person's own account, or a team.
 *
 * A personal organization is a real row with one `owner` member, minted at
 * signup, so that everything ownable takes a single non-null organization id.
 * Surfaces present it as someone's own account; the API treats it like any
 * other organization.
 */
export const ORGANIZATION_KINDS = ["personal", "team"] as const;

export const organizationKindSchema = z.enum(ORGANIZATION_KINDS);

export const organizationSummarySchema = z.object({
  /** Permanent. What anything durable references. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** The public handle. Unique but renameable: never a foreign key. */
  slug: z.string().min(1),
  /**
   * Defaulted rather than required: a response from an API that predates
   * personal organizations parses as a team, which is what it is.
   */
  kind: organizationKindSchema.default("team"),
  /**
   * The uploaded picture's served path; null or absent for the identicon.
   * Optional rather than defaulted: a response from an API that predates
   * uploads carries none, and every renderer already treats a missing
   * picture and a null one alike.
   */
  image: z.string().nullable().optional(),
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

export type ErrorDto = z.infer<typeof errorSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type OrganizationKind = z.infer<typeof organizationKindSchema>;
export type OrganizationSummaryDto = z.infer<typeof organizationSummarySchema>;
export type MembershipDto = z.infer<typeof membershipSchema>;
export type MembershipListDto = z.infer<typeof membershipListSchema>;
export type OrganizationMemberDto = z.infer<typeof organizationMemberSchema>;
export type PendingInvitationDto = z.infer<typeof pendingInvitationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/** Build provenance: describes the artifact, not the data it serves. */
export * from "./build-info.js";

/** Bounty pricing, sizing, run and proposal contracts. */
export * from "./bounty.js";

/** A proposal's spec: the ticket's behaviour as Gherkin scenarios. */
export * from "./spec.js";

/** The Jira wire contract, for `packages/jira` and the routes that use it. */
export * from "./jira.js";

/** Default avatars, computed from an account id rather than stored. */
export * from "./identicon.js";

/* -------------------------------------------------------------------------- */
/* The GitHub wire contract: GitHub App installations and repository pointers */
/* -------------------------------------------------------------------------- */

/*
 * Three families, as in `jira.ts`: `*ResponseSchema` and `*EventSchema` are
 * what GitHub sends (permissive, `.loose()`, unknown fields kept); `*DtoSchema`
 * is what we hand on to the web app (strict, every field required, unknown
 * keys refused); `*RequestSchema` is a body our own clients send (`z.object`,
 * unknown keys stripped, ids must be GitHub id text).
 */

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
  _value: string | number | null | undefined,
): string | null {
  throw new Error("not implemented");
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
 * Body for `POST .../github/connections/:id/repositories`: GitHub's
 * repository id as GitHub id text, and its role.
 */
export const registerRepoRequestSchema = z.object({
  externalId: z.string().regex(/^[1-9][0-9]{0,18}$/, "Expected a GitHub id."),
  role: githubRepoRoleSchema,
});

/** Body for `POST .../github/connections`: GitHub's installation id as text. */
export const linkInstallationRequestSchema = z.object({
  installationId: z
    .string()
    .regex(/^[1-9][0-9]{0,18}$/, "Expected a GitHub id."),
});

/** The installation's settings page on GitHub, for the account type. */
export function githubInstallationSettingsUrl(
  _accountType: string,
  _accountLogin: string,
  _installationId: string,
): string {
  throw new Error("not implemented");
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
