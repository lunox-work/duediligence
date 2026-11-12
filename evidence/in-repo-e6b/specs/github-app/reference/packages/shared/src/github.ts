/**
 * The GitHub App wire contract: installations, the repositories they reach,
 * and the repository pointers an organization tracks.
 *
 * As in `jira.ts`, two families of schema live here:
 *
 * - `*Response` schemas describe what **GitHub sends**. They are permissive:
 *   only what GitHub always sends is required, and `.loose()` keeps unknown
 *   fields, because GitHub adds fields and an unknown one must not be an
 *   error.
 * - `*Dto` schemas, the lists and the bodies describe what **we produce or
 *   accept from our own clients**. Those are strict: every field required and
 *   resolved, enumerations closed, unknown keys stripped.
 *
 * GitHub-to-DTO mapping is not here; it belongs to the integration package.
 *
 * A repository pointer refers to a repository by GitHub's permanent id
 * (`externalId`). `fullName` is only the name last seen: repositories are
 * renamed and transferred, so, like an organization's `slug`, it is never a
 * key.
 */

import { z } from "zod";

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

/* -------------------------------------------------------------------------- */
/* Shared rules                                                                */
/* -------------------------------------------------------------------------- */

const GITHUB_ID_MESSAGE = "Must be a positive whole number.";
const FULL_NAME_MESSAGE = "Must be owner/name.";
const CALLBACK_ID_MESSAGE =
  "installation_id is required unless setup_action is request.";

const CANONICAL_ID = /^[1-9][0-9]*$/;
const MAX_SAFE_ID_TEXT = String(Number.MAX_SAFE_INTEGER);

/**
 * Whether `text` is GitHub id text: a canonical positive decimal no larger
 * than `Number.MAX_SAFE_INTEGER`. Compared as text, not through `Number()`,
 * which rounds values just past the limit back down onto it.
 */
function isGithubIdText(text: string): boolean {
  if (!CANONICAL_ID.test(text)) return false;
  if (text.length !== MAX_SAFE_ID_TEXT.length) {
    return text.length < MAX_SAFE_ID_TEXT.length;
  }
  return text <= MAX_SAFE_ID_TEXT;
}

/**
 * A GitHub id as text. Refused rather than normalised when not canonical, so
 * `"0123"` and `" 12"` fail instead of quietly becoming `"123"` and `"12"`.
 */
const githubIdTextSchema = z
  .string()
  .refine(isGithubIdText, { message: GITHUB_ID_MESSAGE });

/** A GitHub id as GitHub sends it in JSON: a positive safe integer. */
const githubIdNumberSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** Not `.` or `..`, which GitHub reserves. */
const FULL_NAME =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

/**
 * A repository's full name, `owner/name`, under GitHub's character rules. The
 * input is returned unchanged when valid (not trimmed, case kept); otherwise
 * the parse fails with the message `Must be owner/name.`
 */
export const githubRepositoryFullNameSchema: z.ZodType<string, string> = z
  .string()
  .regex(FULL_NAME, { message: FULL_NAME_MESSAGE });

/* -------------------------------------------------------------------------- */
/* What GitHub sends                                                           */
/* -------------------------------------------------------------------------- */

/**
 * An installation as GitHub sends it. Permissive (`.loose()`): only `id` is
 * required, and unknown fields are kept. `repository_selection` and
 * `account.type` are free strings, not our enums.
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
> = z
  .object({
    id: githubIdNumberSchema,
    account: z
      .object({
        login: z.string().optional(),
        id: z.number().optional(),
        type: z.string().optional(),
      })
      .loose()
      .nullish(),
    repository_selection: z.string().optional(),
    suspended_at: z.string().nullish(),
  })
  .loose();

/**
 * A repository as GitHub sends it. Permissive (`.loose()`): only `id` and
 * `full_name` are required, and unknown fields are kept. `full_name` is not
 * checked against the full-name rule: GitHub is the authority on it.
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
> = z
  .object({
    id: githubIdNumberSchema,
    full_name: z.string(),
    name: z.string().optional(),
    owner: z.object({ login: z.string().optional() }).loose().optional(),
    private: z.boolean().optional(),
    default_branch: z.string().optional(),
    archived: z.boolean().optional(),
  })
  .loose();

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
> = z
  .object({
    total_count: z.number().optional(),
    repositories: z.array(githubRepositoryResponseSchema).default([]),
  })
  .loose();

/**
 * The setup URL's query string, which GitHub redirects the browser to after
 * an install. Input keys are GitHub's (snake_case); output keys are camelCase,
 * and extra parameters are dropped. `installation_id` is GitHub id text and
 * becomes a number; it is required unless `setup_action` is `request`, in
 * which case `installationId` is null. Without it otherwise, the parse fails
 * with the message `installation_id is required unless setup_action is
 * request.` at path `["installation_id"]`.
 *
 * `request` is what a member who is not an admin can do: GitHub sends no
 * installation, and any id that does arrive is ignored. `state` is the CSRF
 * guard, as in the Jira flow.
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
> = z
  .object({
    installation_id: githubIdTextSchema.optional(),
    setup_action: githubSetupActionSchema,
    state: z.string().min(1),
  })
  .superRefine((query, ctx) => {
    if (query.setup_action !== "request" && query.installation_id === undefined) {
      ctx.addIssue({
        code: "custom",
        message: CALLBACK_ID_MESSAGE,
        path: ["installation_id"],
      });
    }
  })
  .transform((query) => ({
    installationId:
      query.setup_action === "request" || query.installation_id === undefined
        ? null
        : Number(query.installation_id),
    setupAction: query.setup_action,
    state: query.state,
  }));

/* -------------------------------------------------------------------------- */
/* What we hand on                                                             */
/* -------------------------------------------------------------------------- */

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
> = z.object({
  id: z.string().min(1),
  installationId: githubIdNumberSchema,
  accountLogin: z.string().min(1),
  accountType: githubAccountTypeSchema,
  repositorySelection: githubRepositorySelectionSchema,
  suspended: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const githubInstallationListSchema: z.ZodType<
  { installations: GithubInstallationDto[] },
  { installations: z.input<typeof githubInstallationDtoSchema>[] }
> = z.object({ installations: z.array(githubInstallationDtoSchema) });

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
> = z.object({
  externalId: githubIdTextSchema,
  fullName: githubRepositoryFullNameSchema,
  private: z.boolean(),
  defaultBranch: z.string().min(1),
  archived: z.boolean(),
});

export const githubRepositoryListSchema: z.ZodType<
  { repositories: GithubRepositoryDto[] },
  { repositories: z.input<typeof githubRepositoryDtoSchema>[] }
> = z.object({ repositories: z.array(githubRepositoryDtoSchema) });

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
> = z.object({
  id: z.string().min(1),
  installationId: z.string().min(1),
  externalId: githubIdTextSchema,
  fullName: githubRepositoryFullNameSchema,
  defaultBranch: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export const githubRepositoryPointerListSchema: z.ZodType<
  { pointers: GithubRepositoryPointerDto[] },
  { pointers: z.input<typeof githubRepositoryPointerDtoSchema>[] }
> = z.object({ pointers: z.array(githubRepositoryPointerDtoSchema) });

/**
 * Body for tracking a repository: `POST .../github/repositories`. Names our
 * installation row id and GitHub's repository id as GitHub id text; an
 * invalid id fails with the message `Must be a positive whole number.`
 * Unknown keys are stripped: the full name is read from GitHub, never taken
 * from the client.
 */
export const trackRepositorySchema: z.ZodType<
  { installationId: string; externalId: string },
  { installationId: string; externalId: string }
> = z.object({
  installationId: z.string().min(1),
  externalId: githubIdTextSchema,
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
