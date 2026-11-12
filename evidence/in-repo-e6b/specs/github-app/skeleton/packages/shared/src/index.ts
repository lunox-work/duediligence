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
/* GitHub App installations and repository pointers                           */
/* -------------------------------------------------------------------------- */

/** Whose account a GitHub App installation is on: a user or an organization. */
export const GITHUB_ACCOUNT_TYPES = ["user", "organization"] as const;

export const githubAccountTypeSchema = z.enum(GITHUB_ACCOUNT_TYPES);

/** Whether an installation reaches all of an account's repositories or selected ones. */
export const GITHUB_REPOSITORY_SELECTIONS = ["all", "selected"] as const;

export const githubRepositorySelectionSchema = z.enum(
  GITHUB_REPOSITORY_SELECTIONS,
);

/** The `setup_action` GitHub sends to the setup URL after an install. */
export const GITHUB_SETUP_ACTIONS = ["install", "update", "request"] as const;

export const githubSetupActionSchema = z.enum(GITHUB_SETUP_ACTIONS);

/**
 * A repository's full name, `owner/name`, under GitHub's character rules. The
 * input is returned unchanged when valid (not trimmed, case kept); otherwise
 * the parse fails with the message `Must be owner/name.`
 */
export const githubRepositoryFullNameSchema: z.ZodType<string, string> =
  z.custom<string>(() => {
    throw new Error("not implemented");
  });

/**
 * An installation as GitHub sends it. Permissive (`.loose()`): only `id` is
 * required, and unknown fields are kept.
 */
export const githubInstallationResponseSchema: z.ZodType<
  {
    id: number;
    account?:
      | ({ login?: string; id?: number; type?: string } & {
          [k: string]: unknown;
        })
      | null;
    repository_selection?: string;
    suspended_at?: string | null;
  } & { [k: string]: unknown },
  {
    id: number;
    account?:
      | ({ login?: string; id?: number; type?: string } & {
          [k: string]: unknown;
        })
      | null;
    repository_selection?: string;
    suspended_at?: string | null;
  } & { [k: string]: unknown }
> = z.custom(() => {
  throw new Error("not implemented");
});

/**
 * A repository as GitHub sends it. Permissive (`.loose()`): only `id` and
 * `full_name` are required, and unknown fields are kept.
 */
export const githubRepositoryResponseSchema: z.ZodType<
  {
    id: number;
    full_name: string;
    name?: string;
    owner?: { login?: string } & { [k: string]: unknown };
    private?: boolean;
    default_branch?: string;
    archived?: boolean;
  } & { [k: string]: unknown },
  {
    id: number;
    full_name: string;
    name?: string;
    owner?: { login?: string } & { [k: string]: unknown };
    private?: boolean;
    default_branch?: string;
    archived?: boolean;
  } & { [k: string]: unknown }
> = z.custom(() => {
  throw new Error("not implemented");
});

/**
 * A page of an installation's repositories as GitHub sends it. Permissive
 * (`.loose()`); `repositories` defaults to `[]` and keeps GitHub's order.
 */
export const githubInstallationRepositoriesResponseSchema: z.ZodType<
  {
    total_count?: number;
    repositories: GithubRepositoryResponse[];
  } & { [k: string]: unknown },
  {
    total_count?: number;
    repositories?: z.input<typeof githubRepositoryResponseSchema>[];
  } & { [k: string]: unknown }
> = z.custom(() => {
  throw new Error("not implemented");
}) as never;

/**
 * The setup URL's query string, which GitHub redirects the browser to after
 * an install. Input keys are GitHub's (snake_case); output keys are camelCase,
 * and extra parameters are dropped. `installation_id` is GitHub id text and
 * becomes a number; it is required unless `setup_action` is `request`, in
 * which case `installationId` is null. Without it otherwise, the parse fails
 * with the message `installation_id is required unless setup_action is
 * request.` at path `["installation_id"]`.
 */
export const githubSetupCallbackSchema: z.ZodType<
  {
    installationId: number | null;
    setupAction: GithubSetupAction;
    state: string;
  },
  {
    installation_id?: string;
    setup_action: GithubSetupAction;
    state: string;
  }
> = z.custom(() => {
  throw new Error("not implemented");
}) as never;

/**
 * An installation as we hand it on. Strict: every field required, unknown
 * keys stripped. `id` is our row id; `installationId` is GitHub's.
 */
export const githubInstallationDtoSchema: z.ZodType<
  {
    id: string;
    installationId: number;
    accountLogin: string;
    accountType: GithubAccountType;
    repositorySelection: GithubRepositorySelection;
    suspended: boolean;
    createdAt: string;
  },
  {
    id: string;
    installationId: number;
    accountLogin: string;
    accountType: GithubAccountType;
    repositorySelection: GithubRepositorySelection;
    suspended: boolean;
    createdAt: string;
  }
> = z.custom(() => {
  throw new Error("not implemented");
});

export const githubInstallationListSchema: z.ZodType<
  { installations: GithubInstallationDto[] },
  { installations: z.input<typeof githubInstallationDtoSchema>[] }
> = z.custom(() => {
  throw new Error("not implemented");
});

/**
 * A repository an installation reaches, as we hand it on. Strict.
 * `externalId` is GitHub's permanent id as GitHub id text (a string).
 */
export const githubRepositoryDtoSchema: z.ZodType<
  {
    externalId: string;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    archived: boolean;
  },
  {
    externalId: string;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    archived: boolean;
  }
> = z.custom(() => {
  throw new Error("not implemented");
});

export const githubRepositoryListSchema: z.ZodType<
  { repositories: GithubRepositoryDto[] },
  { repositories: z.input<typeof githubRepositoryDtoSchema>[] }
> = z.custom(() => {
  throw new Error("not implemented");
});

/**
 * A repository pointer: a tracked reference to a repository, keyed by
 * GitHub's permanent id (`externalId`). `fullName` is only the name last
 * seen. `installationId` is our installation row id, not GitHub's number.
 * Strict.
 */
export const githubRepositoryPointerDtoSchema: z.ZodType<
  {
    id: string;
    installationId: string;
    externalId: string;
    fullName: string;
    defaultBranch: string;
    createdAt: string;
  },
  {
    id: string;
    installationId: string;
    externalId: string;
    fullName: string;
    defaultBranch: string;
    createdAt: string;
  }
> = z.custom(() => {
  throw new Error("not implemented");
});

export const githubRepositoryPointerListSchema: z.ZodType<
  { pointers: GithubRepositoryPointerDto[] },
  { pointers: z.input<typeof githubRepositoryPointerDtoSchema>[] }
> = z.custom(() => {
  throw new Error("not implemented");
});

/**
 * Body for tracking a repository: `POST .../github/repositories`. Names our
 * installation row id and GitHub's repository id as GitHub id text; an
 * invalid id fails with the message `Must be a positive whole number.`
 * Unknown keys are stripped.
 */
export const trackRepositorySchema: z.ZodType<
  { installationId: string; externalId: string },
  { installationId: string; externalId: string }
> = z.custom(() => {
  throw new Error("not implemented");
});

export type GithubAccountType = z.infer<typeof githubAccountTypeSchema>;
export type GithubRepositorySelection = z.infer<
  typeof githubRepositorySelectionSchema
>;
export type GithubSetupAction = z.infer<typeof githubSetupActionSchema>;
export type GithubInstallationResponse = z.infer<
  typeof githubInstallationResponseSchema
>;
export type GithubRepositoryResponse = z.infer<
  typeof githubRepositoryResponseSchema
>;
export type GithubInstallationRepositoriesResponse = z.infer<
  typeof githubInstallationRepositoriesResponseSchema
>;
export type GithubSetupCallback = z.infer<typeof githubSetupCallbackSchema>;
export type GithubInstallationDto = z.infer<typeof githubInstallationDtoSchema>;
export type GithubInstallationListDto = z.infer<
  typeof githubInstallationListSchema
>;
export type GithubRepositoryDto = z.infer<typeof githubRepositoryDtoSchema>;
export type GithubRepositoryListDto = z.infer<typeof githubRepositoryListSchema>;
export type GithubRepositoryPointerDto = z.infer<
  typeof githubRepositoryPointerDtoSchema
>;
export type GithubRepositoryPointerListDto = z.infer<
  typeof githubRepositoryPointerListSchema
>;
export type TrackRepositoryInput = z.infer<typeof trackRepositorySchema>;
