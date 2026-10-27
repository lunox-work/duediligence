# Handle suggestions drop their suffix on long names

When a new user's handle stem is taken, `suggest` in `packages/db` tries
`<stem>2`, `<stem>3` and so on, but it cuts the candidate to 30 characters
after adding the number. For a 30-character stem the number is cut off, so
every candidate is the stem itself and we fall through to a random suffix.
Move the candidate sequence into `packages/core/src/handle.ts` as a pure
function next to the other handle rules, and cut the stem, not the number.
