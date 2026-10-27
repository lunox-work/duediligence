# feat: generate identicon avatars for users and organizations (#39)

## feat: generate default avatars from account ids

Every user and organization now has a face without anyone uploading one and
without storing a byte: a 5x5 mirrored grid and a hue, both a pure function of
the account id.

`identicon()` lives in packages/shared as a frozen contract rather than in the
web app, since its output decides what every existing account looks like and a
change cannot be migrated or rolled back. Golden vectors pin four seeds; a
plain determinism test would pass for any refactor that silently changed every
face.

Organizations gain an avatar for the first time — the list showed one lucide
glyph for all of them, and member rows showed none despite the API already
sending `image`. The personal row wears the viewer's own face, not one from
the organization's id, so it matches the rail rather than reading as a second
account. Member rows seed from `userId`, not the `member` row id, so one
person looks the same in every organization.

Measured rather than assumed:

- hsl(hue 65% 45%) does not hold contrast. Lightness and chroma are now oklch
  CSS tokens per theme, at the largest chroma in sRGB at every hue: 4.2-4.6:1
  against `muted` in light, 6.3-7.1:1 in dark.
- An unpadded viewBox leaves 14% of a corner cell inside the circular crop,
  hence `-1 -1 7 7`.
- Radix shows the fallback while an image loads, not only on failure, so a
  grid flashed ahead of every photo; `delayMs` suppresses it. The test for
  this needs a genuinely pending image — against one that has already settled
  it passes with or without the delay.

`initials()` is deleted. One `<path>` rather than 25 `<rect>`s, which avoids
seams between cells at 3.43 device pixels and keeps member lists to one node
per avatar.

`organization.logo` stays unexposed: the Better Auth plugin accepts any string
there and our hooks pass it through, so rendering it would let any signed-in
user aim another account's browser — invitations included — at a URL they
chose, with no CSP to stop it. docs/architecture.md records that.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/shared/src/identicon.ts`:

```ts
export interface Identicon {
    readonly cells: readonly boolean[];
    readonly hue: number;
}

export function identicon(seed: string): Identicon;
```
