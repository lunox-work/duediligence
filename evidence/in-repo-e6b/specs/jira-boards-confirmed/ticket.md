# feat(jira): register boards and query their oldest backlog tickets (#33)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/db/src/jira-boards.ts`:

```ts
export interface StoredBoardSelection {
    readonly maxTickets?: number;
    readonly excludeAssigned?: boolean;
    readonly issueTypes?: readonly string[];
    readonly minAgeDays?: number;
    readonly maxAgeDays?: number | null;
    readonly minSpecChars?: number;
}

export interface JiraBoardSummary {
    readonly id: string;
    readonly connectionId: string;
    readonly externalId: string;
    readonly name: string;
    readonly boardType: string;
    readonly projectKey: string | null;
    readonly selection: StoredBoardSelection;
    readonly writebackEnabled: boolean;
    readonly createdAt: string;
}

export interface RegisterBoardInput {
    readonly connectionId: string;
    readonly externalId: string;
    readonly name: string;
    readonly boardType: string;
    readonly projectKey?: string | null;
    readonly selection?: StoredBoardSelection;
}

export interface UpdateBoardInput {
    readonly selection?: StoredBoardSelection;
    readonly writebackEnabled?: boolean;
}

export interface JiraBoardStore {
    list(organizationId: string): Promise<JiraBoardSummary[]>;
    get(organizationId: string, boardId: string): Promise<JiraBoardSummary | null>;
    register(organizationId: string, input: RegisterBoardInput): Promise<JiraBoardSummary>;
    update(organizationId: string, boardId: string, input: UpdateBoardInput): Promise<JiraBoardSummary | null>;
    remove(organizationId: string, boardId: string): Promise<boolean>;
    forRun(organizationId: string, boardId: string): Promise<{
        board: JiraBoardSummary;
        connectionId: string;
        cloudId: string;
        siteUrl: string;
    } | null>;
}

export function createJiraBoardStore(db: Database): JiraBoardStore;
```
