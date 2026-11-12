# fix(jira): re-check membership when the OAuth callback lands (#34)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/api/src/routes.ts`:

```ts
export interface AppOptions {
    store: TodoStore;
    corsOrigins: readonly string[];
    auth?: Auth | undefined;
    emails?: EmailStore | undefined;
    profiles?: UserProfileStore | undefined;
    organizations?: OrganizationStore | undefined;
    jira?: Omit<JiraRouteOptions, "roleOf"> | undefined;
    originVerify?: string | undefined;
    buildInfo?: BuildInfoDto | undefined;
}
```
