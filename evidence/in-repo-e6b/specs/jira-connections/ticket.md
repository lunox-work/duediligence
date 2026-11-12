# feat(jira): store Jira connections with encrypted tokens (#29)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/db/src/cipher.ts`:

```ts
export class TokenCipherError extends Error {
    constructor(message: string);
}

export interface TokenCipher {
    encrypt(plaintext: string | null): string | null;
    decrypt(ciphertext: string | null): string | null;
    readonly keyId: string;
}

export function createTokenCipher(key: string, options: {
    keyId?: string;
} = {}): TokenCipher;

export function sameKeyId(left: string, right: string): boolean;
```

In `packages/db/src/jira-connections.ts`:

```ts
export interface JiraConnectionSummary {
    readonly id: string;
    readonly cloudId: string;
    readonly siteUrl: string;
    readonly siteName: string;
    readonly email: string | null;
    readonly healthy: boolean;
    readonly scopes: readonly string[];
    readonly createdAt: string;
}

export interface JiraConnectionTokens {
    readonly accessToken: string | null;
    readonly refreshToken: string | null;
    readonly expiresAt: string | null;
    readonly scopes: readonly string[];
}

export interface JiraConnectionInput {
    readonly cloudId: string;
    readonly siteUrl: string;
    readonly siteName: string;
    readonly email?: string | null;
    readonly accessToken: string | null;
    readonly refreshToken: string | null;
    readonly expiresAt: string | null;
    readonly scopes: readonly string[];
}

export interface JiraConnectionStore {
    list(organizationId: string): Promise<JiraConnectionSummary[]>;
    get(organizationId: string, connectionId: string): Promise<JiraConnectionSummary | null>;
    upsert(organizationId: string, input: JiraConnectionInput): Promise<JiraConnectionSummary>;
    tokens(organizationId: string, connectionId: string): Promise<JiraConnectionTokens | null>;
    saveTokens(connectionId: string, tokens: {
        accessToken: string | null;
        refreshToken: string | null;
        expiresAt: string | null;
        scopes: readonly string[];
    }): Promise<void>;
    markUnhealthy(connectionId: string): Promise<void>;
    remove(organizationId: string, connectionId: string): Promise<boolean>;
}

export function createJiraConnectionStore(db: Database, cipher: TokenCipher): JiraConnectionStore;
```

In `packages/db/src/schema/jira.ts`:

```ts
export const jiraConnection = …;

export type JiraConnectionRow = typeof jiraConnection.$inferSelect;

export type NewJiraConnectionRow = typeof jiraConnection.$inferInsert;
```
