# feat(web): open Jira sites, boards and tickets as their own pages (#42)

* feat(jira): open a connected site as its own page, with its boards

The connected-sites card carried everything: every site's boards in one
list below it, a bin on each row, and an "Add a board" button per site.
Three problems in one. A column of bins beside similar site names is how
the wrong site gets disconnected. A board list that spans sites cannot
say which site a board is on without repeating it on every row. And
picking boards one at a time asked the person to repeat a decision they
had already made by connecting the site.

So a site is now a page. Each row carries the Jira mark, is clickable
across its whole width, and ends in a chevron; `/o/:slug/jira/:id` is a
real screen, so the page is bookmarkable and the trail reads
Home / Organizations / Acme / Jira / lunox-work. Its boards, its backlog
previews and its disconnect button all live inside it.

Boards are no longer chosen. Every board on a site is registered when the
site is connected, and re-read whenever the site's page opens — which is
what picks up a board created in Jira since. A site whose boards cannot
be listed, because the Atlassian app lacks the Agile scopes, is still a
connected site: that failure is swallowed in the callback rather than
turning a real grant into a failed connection.

The store grows `sync` beside `register` for this. They differ in one
thing that matters: a sync refreshes only what is Jira's to state — the
name, the type, the project — and leaves `selection` and
`writebackEnabled` alone, because it runs on every visit against boards
somebody has already configured. `register` overwrites the selection
because a caller passing one is asking for it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(jira): lift the connect button out of the sites card

Inside the card it sat directly under the last site, reading as one more
row in the list rather than as something you do to the list. It now
trails the card on the right, where the eye finishes a list and where
this app puts the action a page is for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(org): make the three connections equal square tiles you press

They were stacked full-width rows, which made the first read as the
heading of a list the other two belonged to. One of the three is built
and two are not, but that is a fact about today rather than a ranking —
so they are now equal squares in a grid, three across and two on a
phone, each centred on its mark.

The tile is the button. There is one thing to do with a tool and the
whole square is the target, so nobody has to aim at a word inside a
large box; the square lights on hover to say so. "Manage" is drawn as a
`span` rather than a nested `Button`, because a button inside a button
is invalid HTML and browsers resolve it by dropping one of the two from
the accessibility tree. Each tile keeps its own `aria-label`, or a
screen reader hears three buttons called "Manage".

Also fixes a race in the breadcrumb test added last commit: it clicked
the Jira crumb as soon as it appeared, but that crumb is in the trail
before the organization list arrives, so the click sometimes landed
while the slug was still undefined and fell back to /organizations.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(jira): open a board as its own page, tickets beside their detail

Three changes, one shape. A board row carries the mark of the kind of
board it is — three columns for Kanban, a sprint's repeat for Scrum,
which is the difference worth scanning for since a Kanban board has no
backlog of its own. The row is clickable across its width and ends in a
chevron, as a connected site's row does one level up; the "Preview"
button it replaced named the mechanism rather than the destination.

And a board is now a screen at /o/:slug/jira/:site/:board rather than a
dialog. The dialog made reading a ticket cost the list: going back was
the only way to reach the next one, and comparing two meant opening each
in turn from memory. The page splits in half instead — tickets on the
left, the one you picked on the right — so the list stays put and the
panel changes under it. The selected row is marked, because in a column
of similar summaries that is the only way to tell which one the panel is
showing.

Below `md` the panel covers the list, with a control back. Two columns
on a phone would each be too narrow to hold a summary, let alone a spec.

The board page reports both its own name and its site's up to the shell:
`JiraSite` is not mounted here, so arriving by URL would otherwise leave
the site crumb reading "Site" until the person navigated up. `Crumb`
grows a `connectionId` for the same reason — the site crumb needs it to
navigate, since the slug alone resolves one level too high.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): align the trail and the home page to the page column

The trail capped an `ol` inside a padded `nav`, while every page caps and
pads one `main`. The padding therefore applied outside the capped box, and
the crumbs began 24px left of every heading below them. Capping and padding
the same element aligns the two.

The board is the one `max-w-5xl` page, where a narrow trail was misaligned
the other way, so the cap follows the screen.

Home used `p-6` where every other page uses `px-4 py-10 sm:px-6 sm:py-14`,
which put its heading 48px higher and moved it on every navigation.

The four "no organization yet" blocks in the shell were the same markup
four times, three of them at padding no page uses. They become one
component, which also gives them the spinner the rest of the app uses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): keep the open ticket on screen beside a long list

The panel was drawn at the top of the grid, which is where the list began.
Opening a ticket from the foot of a long backlog rendered it ~400px above
the viewport, so the only visible effect of the click was the row lighting
up. It is now pinned below the top of the column, with its own bounded
scroll for a ticket longer than the screen.

The spec's own 26rem scroll box goes with it: the panel scrolls now, and
two scrollbars for one document is one too many.

Below `md` the panel covers the list but the page kept the list's scroll
position, opening the ticket somewhere mid-spec. It now anchors to the top.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): let the Jira outcome banner wrap instead of truncating

Title and detail shared one line with the detail truncated, so even the
shortest of these sentences was clipped at 1280px. The one that matters is
`partial-scopes`, whose detail names the two scopes to grant and the tab
they hide behind — instructions, cut off mid-word, for the one outcome that
needs acting on.

It now stacks title over detail and wraps, with a wash and an icon per tone
to match `ErrorBanner`, and a role so a screen reader says something when
the flow returns: `alert` for a failure, `status` for the rest.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): give every pressable control a pointer and a hover state

Tailwind v4's preflight leaves `button` at `cursor: default`, a change from
v3. shadcn's `Button` sets `cursor-pointer` itself, so it was the
hand-rolled controls that ended up with an arrow: every row on the Jira
pages, the connection tiles, the tab triggers, the menu items. One rule in
the base layer covers them, and the seven scattered `cursor-pointer`
classes it makes redundant come out. The menu items need an unlayered rule,
because shadcn ships them `cursor-default` as a utility and a utility beats
a bare element selector.

Three controls also had no hover state at all. `EditableField` cancelled
its own fill with `hover:bg-transparent`; the rail cancelled its fill at
exactly the widths the rail exists at; the logo had none. The generated
tabs get theirs from `index.css`, by the slot they already carry.

The edit pencil was `opacity-0` until hovered, so on a touch screen it
never appeared and a name, a username and a handle looked like plain text.
It now rests at 40%.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(web): confirm disconnect, remove and leave in a dialog

Four actions here give away access or destroy data. Only deleting an
organization asked; disconnecting a site, removing a member and leaving one
all fired on a single click, beside rows of near-identical names.

One `ConfirmDialog` for all four, built on the generated dialog that was in
the repo unused. Each question names what it is about — "Disconnect acme?",
"Remove Grace Hopper?" — because a dialog reading "Are you sure?" over a
column of similar rows is a question nobody can answer. Deleting keeps its
typed confirmation as the second gear.

The Settings tab becomes a danger zone of two rows, each with its own
sentence and button. Delete's typed confirmation used to expand inline
under a card headed "Leaving", directly beneath the leave button, so the
words "Type acme to confirm" appeared to belong to the wrong action.

Signing out is deliberately still one click: it costs one click to undo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(web): open a site from home, and drop Manage from unbuilt tools

Home listed each connected site as inert text. The only control was a ghost
"Manage" leading to the organization's Jira list — one step short of the
site the reader was already looking at. The rows are now the same
`ConnectionRow` the Jira page uses, carrying their owner so the URL can
name both. "Manage" stays, for the list and for connecting another.

The GitHub and Slack tiles drew a disabled "Manage" button, which is an
affordance for something that does not exist; they carry a badge instead.
And `aspect-square` made a 186px box for three short lines, so the tiles
take a floor instead of a ratio.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): unify errors, loading lines and small inconsistencies

Errors were an `ErrorBanner` on four screens and a bare red paragraph on
three others; loading was a bare "Loading…", a spinner beside the word, or
nothing at all. Both now come from `components/Message`, which gains
`LoadingLine` for the third case. The members list had no loading state, so
an organization briefly looked as though it had no members, and its read
ignored `!res.ok` entirely — a 500 left an empty list and no reason.

`text-base` on four card titles made tailwind-merge drop `leading-none`, so
those headings were 8px taller than the same component elsewhere.

A long member or organization name wrapped and grew its row; both truncate.
The owner badge drew a tick the organizations list does not. "Connected
Accounts" was the only Title Case heading.

Creating an organization now shows the handle it derives before you commit
to it, focuses its only field, and cancels back to the list it was opened
from rather than home.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(web): surface pending invitations and organizations in the rail

Nothing is emailed when somebody is invited: the invitation appears on the
invitee's account page and nowhere else, so the only way to discover one
was to open Account and scroll. The avatar now carries a mark, and the
count travels with the menu item that leads to them. The count is in the
trigger's accessible name too, because a mark that is purely colour says
nothing to a screen reader.

Organizations joins the rail. It is the parent of most screens here and was
reachable only through the avatar menu, and it marks itself current
everywhere beneath it — a rail that marks nothing while you are three
levels into an organization says you are nowhere.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): line up the coming-soon badge with the Manage button

A badge is 22px tall against the affordance's 34px, and with the tiles
aligned to their own feet the badge's text sat 12px below the button's on
the tile beside it — which read as the unbuilt tools sagging. Matching the
height puts all three feet on one line.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): let the page scroll the open ticket, not the panel itself

The pinned panel carried its own `overflow-y-auto`, which made it a second
scrolling region: the wheel went to whichever region the cursor happened to
be over, so reading a ticket meant moving the pointer into the panel first,
and scrolling with it over the list moved the page underneath instead.

Removing the panel's scroller and its viewport cap leaves the page column
as the only one, so the wheel does the same thing wherever the cursor is. A
ticket taller than the screen now makes the page longer, which is also what
lets its foot be reached at all. Sticky stays, so a short ticket is still
pinned while the list scrolls past it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(web): open a ticket as a peek over the backlog

The two-column split gave each side half the width, so a spec with a table
in it rendered in about 400px while the other half showed thirty rows of
truncated summaries nobody reads while reading a ticket. The ticket now
opens as a sheet from the right over a dimmed list, which is the shape a
record takes in Notion and the one this page wanted.

It also settles which region the wheel belongs to, which the split never
did: pinned inside the page's own scroller, the panel either captured the
wheel when the cursor was inside it or stretched the page when it had no
scroller of its own. A peek is one scrolling region with the page locked
behind it.

And it is one layout rather than two. The split collapsed to a single
column below `md`, hiding the list behind a bespoke "All tickets" control;
the peek is a full-width sheet there instead.

Radix brings the focus trap, Escape and the click outside. It does not
bring the focus return, because a peek has no `Trigger` to return to — the
row that opened it is remembered and restored by hand, or a keyboard reader
who peeks one ticket lands on `<body>` and loses the backlog.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* feat(web): open the peek on the click, with the ticket's shape inside it

Opening waited for Jira to answer before showing anything, so a click's only
answer was a small spinner in the row — on a slow read the page looked
unchanged, which invites a second click. The peek now opens immediately and
holds a skeleton of the ticket: heading, status line, tabs and spec box, in
the positions the real one lands in, so nothing jumps when it arrives.

The shimmer is a band sweeping across a muted base rather than a pulse: a
pulse dims in place and reads as something switched off, while a sweep has a
direction and reads as work in progress. It goes under `prefers-reduced-
motion`, leaving the shape behind.

A ref tracks which ticket the reader last asked for, so a superseded
response cannot land on top of a newer one, and closing mid-flight does not
let the answer reopen the panel.

The ticket's own header is rearranged with it. The type now sits under the
status badge rather than beside it, leaving that line a statement of fact;
"Open in Jira" becomes a button on the tab row's right edge, carrying Jira's
mark, since it is a control and belongs with the other controls.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): say "Today" rather than "0d" on a ticket raised today

"0d" was the one value in the age column that read as a missing number
instead of an age. The rest of the scale counts upward from it, so nothing
else in the list makes a zero legible as a quantity.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(web): hide the edit pencil at rest, but keep it on touch

The three editable lines read as prose at rest, so the pencil goes back to
`opacity-0` and arrives with the pointer or with keyboard focus.

On a phone neither of those ever happens, which is what made `opacity-0`
wrong the first time round: nothing said a name or a handle could be
changed at all. A `coarse:` custom variant covers that case — where the
primary pointer cannot hover, the pencil is simply always visible — so the
quiet look costs touch users nothing.

Also pushes Cancel and Create to opposite ends of the create-organization
form, with the commit on the right where the eye finishes the form.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

---------

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/db/src/jira-boards.ts`:

```ts
export type SyncBoardInput = Omit<RegisterBoardInput, "selection">;

export interface JiraBoardStore {
    list(organizationId: string): Promise<JiraBoardSummary[]>;
    get(organizationId: string, boardId: string): Promise<JiraBoardSummary | null>;
    register(organizationId: string, input: RegisterBoardInput): Promise<JiraBoardSummary>;
    sync(organizationId: string, input: SyncBoardInput): Promise<JiraBoardSummary>;
    update(organizationId: string, boardId: string, input: UpdateBoardInput): Promise<JiraBoardSummary | null>;
    remove(organizationId: string, boardId: string): Promise<boolean>;
    forRun(organizationId: string, boardId: string): Promise<{
        board: JiraBoardSummary;
        connectionId: string;
        cloudId: string;
        siteUrl: string;
    } | null>;
}
```
