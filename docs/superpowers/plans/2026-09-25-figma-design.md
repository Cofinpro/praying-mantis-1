# PreyingMantis Figma Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Figma file for PreyingMantis with Cofinpro-themed design tokens as variables, a component library bound to those tokens, and a desktop mock of every page.

**Architecture:** Everything is created through the Figma MCP `use_figma` tool (Plugin API JavaScript), in a few large, idempotent scripts: tokens first, then components that bind only to semantic variables, then screens assembled from component instances. Each script ends by returning counts or IDs, which is how we verify it, instead of screenshots.

**Tech Stack:** Figma MCP (`create_new_file`, `use_figma`, one `get_screenshot` at the end), Figma Plugin API, Inter.

**Spec:** `docs/superpowers/specs/2026-09-25-figma-design-design.md`

## Global Constraints

- Product name: **PreyingMantis**. The logo is an orange mantis mark plus the "PreyingMantis" wordmark.
- Cofinpro theming: orange `#FD6202`, ink `#131313`, green `#60D391`, purple `#8242D8`, blue `#006CFF`, font **Inter**, pill buttons, 16px card corners.
- Light mode only: one mode, "Light". Desktop only: screen frames are 1440 wide.
- Variable names use `/`, and each one's WEB code syntax is the CSS variable (`color/text/primary` → `var(--color-text-primary)`).
- `Primitives` collection: `hiddenFromPublishing = true`. Components and screens bind to `Tokens` variables only, never to primitives or raw hex.
- `#FD6202` is used only for fills, the logo and large text (≥ 24px, or ≥ 18.66px bold). Normal-size text, links and primary buttons use `orange/700` `#C24A00`.
- Every seat state has an icon or pattern and a text label, never colour alone.
- Mock data follows `plan.md` contracts: levels `junior|expert|senior|architect|senior_architect`, clients `DKB|Deka|VV|DBIS|UNION`, seat labels like `DKB-03`.
- Figma MCP budget: Starter plan with a View seat, so read tools are limited to 20 calls a month. Never call `get_screenshot`, `get_metadata` or `get_design_context` except for the single check in Task 7. All verification happens inside `use_figma` return values.
- Before every `use_figma` call, the `figma:figma-use` skill must be loaded. Load `figma:figma-generate-library` for Tasks 2–4 and `figma:figma-generate-design` for Tasks 5–6.

## Review Focus

1. **A raw fill that isn't bound to a variable** slips into a component or screen, so a token change wouldn't reach it. Expect every solid fill or stroke on the Components and Screens pages to be bound. Pinned by the audit in Task 7, Step 1.
2. **Brand orange `#FD6202` used for small text**, which fails AA. Expect no text node under 24px whose fill is bound to `color/brand/accent`. Pinned by the audit in Task 7, Step 1.
3. **A seat state shown by colour only.** Expect every `Seat` variant except `free` to contain an icon or hatch layer, and every variant to show a label. Pinned by the check in Task 4, Step 3.
4. **Inter not loaded**, so text silently falls back or the script throws halfway. Expect each script to `await figma.loadFontAsync` for every Inter weight it uses before creating text. Pinned by Task 2, Step 1 (the script fails loudly if the fonts are missing).
5. **Screens built from detached copies instead of instances**, so a component change doesn't propagate. Expect the top bar, cards, badges, buttons and seats on the screens to be `INSTANCE` nodes. Pinned by the audit in Task 7, Step 1.

---

## File structure (Figma pages)

- `Cover`: title "PreyingMantis — Design", status, a link to the spec
- `Foundations`: colour swatches (primitives and semantic), type scale, spacing, radius, shadows
- `Components`: one section per component set
- `Screens`: one section per page, main frame first, then its state frames to the right

Repo files touched: `CLAUDE.md` and `decisions.md` (the file URL, Task 7).

---

### Task 1: Create the Figma file and its pages

**Files:** new Figma file in team `team::1654536832917874864` ("A equipe de bernardo.santos")

**Interfaces:**
- Produces: `fileKey` (used by every later `use_figma` call) and the page names `Cover`, `Foundations`, `Components`, `Screens`

- [ ] **Step 1:** Load the `figma:figma-create-new-file` skill, then call `create_new_file` with name `PreyingMantis — Design`, type design, in plan `team::1654536832917874864`. Record the `fileKey` and URL.
- [ ] **Step 2:** Load `figma:figma-use`. Run `use_figma` to rename the first page to `Cover` and create `Foundations`, `Components` and `Screens`. Add the Cover text (Inter Bold 40 "PreyingMantis — Design", Inter 16 "Cofinpro theme · light · desktop 1440 · spec: docs/superpowers/specs/2026-09-25-figma-design-design.md"). Return `figma.root.children.map(p => p.name)`.
- [ ] **Step 3: Verify:** the return value equals `["Cover","Foundations","Components","Screens"]`. If creating the file fails with a permission error, stop and report it: the View seat can't edit, and the user must upgrade the seat or provide another file.

### Task 2: Tokens: variables, text styles and effect styles

**Interfaces:**
- Consumes: `fileKey`
- Produces: variable collections `Primitives` (hidden) and `Tokens` (mode `Light`), with the variable names below; text styles `display, h1, h2, h3, body, body-sm, label, caption`; effect styles `shadow/sm`, `shadow/md`. Later scripts look them up by name with `figma.variables.getLocalVariablesAsync()` and `figma.getLocalTextStylesAsync()`.

- [ ] **Step 1:** Run one `use_figma` script, written to be idempotent: find an existing collection or variable by name and update it, otherwise create it. It must:
  - `await figma.loadFontAsync` for Inter Regular, Medium, Semi Bold and Bold, and throw if any fails.
  - Create `Primitives` with `hiddenFromPublishing = true` and these COLOR variables (scopes `[]`):
    - `orange/50..900` = FFF3EB, FFE2CC, FFC299, FF9F5C, FE7F2B, FD6202, D95400, C24A00, 9A3B00, 6B2900
    - `neutral/0` = FFFFFF, and `neutral/50..900` = F7F7F5, EFEFEC, E2E2DE, C9C9C4, 9E9E98, 6E6E6E, 525252, 3A3A3A, 242424, 131313
    - `green/50` ECFBF2, `green/100` D3F5E1, `green/400` 60D391, `green/600` 2E9E5F, `green/700` 1F7A47
    - `red/50` FDECEE, `red/100` F9D0D5, `red/500` D6203A, `red/700` A3122A
    - `blue/50` E6F0FF, `blue/500` 006CFF, `blue/700` 0050BD
    - `purple/50` F3ECFC, `purple/500` 8242D8, `purple/700` 6229AE
  - Create `Tokens` and rename its default mode to `Light`. Add these COLOR aliases (`{type:'VARIABLE_ALIAS', id}`):
    - `color/bg/canvas`→neutral/50, `color/bg/surface`→neutral/0, `color/bg/subtle`→neutral/100, `color/bg/brand-subtle`→orange/50
    - `color/text/primary`→neutral/900, `color/text/secondary`→neutral/600, `color/text/muted`→neutral/500, `color/text/brand`→orange/700, `color/text/on-brand`→neutral/0
    - `color/border/default`→neutral/200, `color/border/strong`→neutral/300, `color/border/focus`→orange/500
    - `color/action/primary`→orange/700, `color/action/primary-hover`→orange/800, `color/action/danger`→red/500
    - `color/brand/accent`→orange/500
    - `color/status/pending/bg`→purple/50 and `/fg`→purple/700; `approved` green/50 and green/700; `rejected` red/50 and red/700; `withdrawn` neutral/100 and neutral/600; `cancelled` neutral/100 and neutral/600
    - `color/seat/free/bg|fg|border` → neutral/0, neutral/900, neutral/300; `taken` → red/500, neutral/0, red/700; `mine` → green/400, neutral/900, green/700; `unavailable` → neutral/100, neutral/500, neutral/200
  - Colour scopes: `bg/*`, `status/*/bg` and `seat/*/bg` get `FRAME_FILL, SHAPE_FILL`; `text/*` and `*/fg` get `TEXT_FILL`; `border/*` and `seat/*/border` get `STROKE_COLOR`; `action/*` and `brand/*` get `FRAME_FILL, SHAPE_FILL`.
  - FLOAT variables in `Tokens`:
    - `space/1,2,3,4,5,6,8,10,12,16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, with scope `GAP`, `WIDTH_HEIGHT`
    - `radius/sm` 8, `radius/md` 12, `radius/lg` 16, `radius/pill` 9999, with scope `CORNER_RADIUS`
  - Every variable: `setVariableCodeSyntax('WEB', 'var(--' + name.replaceAll('/', '-') + ')')`.
  - Text styles (Inter; size/line height; style): display 40/48 Bold, h1 32/40 Bold, h2 24/32 Semi Bold, h3 18/26 Semi Bold, body 16/24 Regular, body-sm 14/20 Regular, label 14/20 Medium, caption 12/16 Medium.
  - Effect styles: `shadow/sm` DROP_SHADOW 0 1 blur 2, #131313 at 6%; `shadow/md` 0 8 blur 24, #131313 at 10%.
  - Return `{primitives: n, tokens: n, textStyles: n, effectStyles: n, sampleCodeSyntax: <codeSyntax of color/text/primary>}`.
- [ ] **Step 2: Verify:** expect `primitives: 36` (orange 10, neutral 11, green 5, red 4, blue 3, purple 3), `tokens: 52` (38 colour, 14 float), `textStyles: 8`, `effectStyles: 2`, and `sampleCodeSyntax.WEB === "var(--color-text-primary)"`. If a count is off, fix the script and rerun; it's idempotent.

### Task 3: Foundations page and base components

**Interfaces:**
- Consumes: the `Tokens` variables and text styles from Task 2
- Produces: component sets and components on `Components`, looked up later by name: `Button`, `TextField`, `Textarea`, `Select`, `DateTimeField`, `Checkbox`, `StatusBadge`, `LevelTag`, `Avatar`, `Logo`, `Alert`, `EmptyState`, `Tooltip`. Variant property names match React props: `variant`, `size`, `state`, `status`, `level`, `checked`.

- [ ] **Step 1:** One `use_figma` script builds `Foundations`:
  - a swatch grid for each primitive ramp, and each semantic token with its name and code syntax; every swatch fill is bound with `setBoundVariableForPaint`
  - the eight text styles as samples
  - spacing bars and radius tiles bound to the FLOAT variables
  - two shadow cards

  Return the number of swatches.
- [ ] **Step 2:** One `use_figma` script builds the base components on `Components`, using auto layout, and binding padding, gap and radius to `space/*` and `radius/*` and every fill, stroke and text colour to `Tokens` variables:
  - **Button:** `variant` = primary | secondary | ghost | danger; `size` = sm | md; `state` = default | hover | disabled. That's 24 variants.
    - Sizes: sm has padding 8/16 and `label` text; md has 12/24 and `label` text. All use `radius/pill`.
    - Primary: `action/primary` fill (hover: `action/primary-hover`) with `text/on-brand` text.
    - Secondary: `bg/surface` fill, `border/strong` stroke, `text/primary` text.
    - Ghost: no fill (hover: `bg/subtle`) and `text/brand` text.
    - Danger: `action/danger` fill with `text/on-brand` text.
    - Disabled: 40% opacity.
    - Add a TEXT component property `label`.
  - **TextField, Textarea, Select, DateTimeField:** `state` = default | focus | error | disabled.
    - Layout: a `label` text above, a `bg/surface` box with a `border/default` stroke (focus: `border/focus` 2px; error: `status/rejected/fg`), and help or error text in `caption`.
    - Select has a chevron; DateTimeField has a calendar glyph and the placeholder `2026-10-14 09:00`.
    - Radius `radius/sm`, height 40 (Textarea 96).
  - **Checkbox:** `checked` = true | false, `state` = default | disabled, with a label.
  - **StatusBadge:** `status` = pending | approved | rejected | withdrawn | cancelled. A pill with `status/<s>/bg` fill, and `caption` text in `status/<s>/fg` showing Pending, Approved, Rejected, Withdrawn or Cancelled.
  - **LevelTag:** `level` = junior | expert | senior | architect | senior_architect. A pill with a `bg/subtle` fill, `text/secondary` caption text, and the labels Junior, Expert, Senior, Architect, Senior architect.
  - **Avatar:** `size` = sm (32) | md (64). A circle with `bg/brand-subtle` fill and `text/brand` initials.
  - **Logo:** a 28px mantis mark drawn from vector shapes (a triangular head, two raised foreleg strokes and a body) with `brand/accent` fill, plus the "PreyingMantis" wordmark in Inter Bold 20 with `text/primary` fill.
  - **Alert:** `variant` = error | success. Error uses the rejected colours and success the approved colours. It has an icon, a title and a message.
  - **EmptyState:** an icon circle, an `h3` title, `body-sm` text, and an optional Button instance.
  - **Tooltip:** a `neutral/900` equivalent. **Add the token `color/bg/inverse`→neutral/900 and `color/text/inverse`→neutral/0 in this script, and add both to the spec's semantic table in the same commit as Task 7.** It shows "Taken by Ana Costa" in `body-sm`, with a caret.

  Return `{sets: [...names], variantCounts: {...}}`.
- [ ] **Step 3: Verify:** expect the counts Button 24, TextField 4, Textarea 4, Select 4, DateTimeField 4, Checkbox 4, StatusBadge 5, LevelTag 5, Alert 2, Avatar 2.

### Task 4: Composite components

**Interfaces:**
- Consumes: the Task 3 components (by name)
- Produces: `NavItem`, `TopBar`, `NotificationBell`, `NotificationItem`, `NotificationDropdown`, `TrainingCard`, `ApprovalRow`, `Seat`, `SeatLegend`, `ProfileHeader`

- [ ] **Step 1:** One `use_figma` script builds, binding everything to tokens:
  - **NavItem:** `state` = active | inactive | external. Active uses a `bg/brand-subtle` fill and `text/brand`; inactive uses `text/secondary`; external uses `text/secondary` with a "↗" suffix.
  - **NotificationBell:** `unread` = true | false. With unread, an `action/primary` dot (not `brand/accent`: white on #FD6202 is only 3.0:1) shows the count "3" in `text/on-brand`, at caption size in bold.
  - **NotificationItem:** `read` = true | false. Unread has a `bg/brand-subtle` fill and a dot. It shows the message, e.g. "Your request for React Basics was approved", and a caption time.
  - **NotificationDropdown:** 360 wide, `bg/surface`, `radius/lg`, `shadow/md`, holding five NotificationItem instances with unread first.
  - **TopBar:** 1440 × 64, `bg/surface` with a bottom `border/default`. On the left, a Logo instance. In the middle, NavItems for Trainings (active), Seats, Approvals, Timesheets ↗ and Vacations ↗. On the right, a NotificationBell (unread) and an sm Avatar showing "BS" next to the name "Bernardo Santos". Horizontal padding is `space/10`.
  - **TrainingCard:** `state` = default | hover, with a boolean property `showStatus`. It is 320 wide, `bg/surface`, `radius/lg`, with a `border/default` stroke (hover: `shadow/md`). Content:
    - an `h3` name
    - a `body-sm` date "Tue 14 Oct 2026 · 09:00–12:00"
    - the trainer "Trainer: Diogo" or "External – Acme Academy"
    - a LevelTag row
    - "8 of 12 seats left" in `text/secondary`
    - a StatusBadge that shows only when `showStatus` is on
  - **ApprovalRow:** a full-width row with an sm Avatar, the employee name and level, the training name and date, "Requested 23 Sep", a TextField for an optional comment, and the Buttons Reject (secondary) and Approve (primary).
  - **Seat:** `state` = free | taken | mine | unavailable; `interaction` = default | hover | focus. It is 56 × 56 with `radius/sm`, `seat/<state>/bg` fill, `seat/<state>/border` stroke, and a caption label "DKB-03" in `seat/<state>/fg`.
    - Icons: taken has a 12px lock and mine has a 12px check, both vector, in `seat/<state>/fg`.
    - Unavailable has a diagonal hatch: a child frame named `hatch` holding 45° lines in `seat/unavailable/border`.
    - Hover: a `border/strong` 2px stroke (free only; the others keep their own stroke). Focus: a 2px `border/focus` ring, offset by 2.
  - **SeatLegend:** four rows, each with a small Seat instance and a label: Free, Taken, Your seat, Other client's zone.
  - **ProfileHeader:** a card with an md Avatar, an `h2` name, the email, and label/value pairs for Client DKB, Level Senior and Team lead Maria Silva.

  Return the variant counts, plus `seatCheck`: for each Seat variant, whether it has a label text, and (for every state except free) an icon or `hatch` child.
- [ ] **Step 2: Verify the counts:** NavItem 3, NotificationBell 2, NotificationItem 2, TrainingCard 2, Seat 12.
- [ ] **Step 3: Verify Review Focus #3:** `seatCheck` must be all `true`. If any is `false`, fix and rerun.

### Task 5: Screens: Login, Trainings list, Notifications, Training detail

**Interfaces:**
- Consumes: the components from Tasks 3–4 (instances only, via `component.createInstance()`)
- Produces: frames on `Screens` named `01 Login`, `01b Login – error`, `02 Trainings`, `02b Trainings – empty`, `02c Trainings – admin`, `08 Notifications open`, `03 Training detail`, `03b – pending`, `03c – approved`, `03d – full`, `03e – cancelled`

Every screen frame is 1440 × 1024 (taller when the content needs it), with a `bg/canvas` fill and the TopBar instance at the top (Login has no TopBar). Content is centred with a max width of 1200. Screens are placed in rows, one row per page, 120 apart.

- [ ] **Step 1:** Load `figma:figma-generate-design`. One `use_figma` script:
  - **01 Login:** a centred 400-wide card (`bg/surface`, `radius/lg`, `shadow/md`) with the Logo, the `h2` "Log in", TextField Email, TextField Password, and a full-width primary md Button "Log in". Include a `caption` hint "Use your company email".
  - **01b Login – error:** the same, with an error Alert "Invalid email or password" above the fields.
  - **02 Trainings:** the `h1` "Trainings", the subtitle "Upcoming trainings for your level", and a LevelTag chip "Senior". Below, a grid of six TrainingCards (3 columns, gap `space/6`) with realistic names: React Basics, FastAPI in Practice, SQL Performance, Clean Architecture, Kubernetes 101, Effective Code Reviews. Two of them show status badges (pending and approved).
  - **02b Trainings – empty:** an EmptyState reading "No upcoming trainings for your level".
  - **02c Trainings – admin:** the same as 02, with a primary Button "New training" to the right of the heading.
  - **08 Notifications open:** the same as 02, with a NotificationDropdown instance under the bell.
  - **03 Training detail:** a back link "← All trainings" (`text/brand`), the `h1` "React Basics", and a two-column layout:
    - Left (760 wide): meta rows for Date, Time (shown as local time), Trainer, Levels and Seats "8 of 12 left", then the `h3` "About this training" and three paragraphs of description.
    - Right (360-wide sticky panel card): the seats left, and a primary md Button "Request to join".
  - **03b – pending / 03c – approved:** the panel shows a StatusBadge and a secondary Button "Withdraw". 03c also says "You're in. See you there."
  - **03d – full:** a disabled primary Button and the text "No seats left".
  - **03e – cancelled:** an error Alert at the top, "This training was cancelled", a cancelled StatusBadge, no action buttons, and the training name with strikethrough.

  Return the names of the frames created and each frame's number of `INSTANCE` descendants.
- [ ] **Step 2: Verify:** all 11 frames exist, and every frame except the two Login frames has at least one instance.

### Task 6: Screens: Create/edit training, Approvals, Seats, Profile

**Interfaces:**
- Consumes: the components from Tasks 3–4
- Produces: frames `04 New training`, `04b – validation errors`, `04c Edit training`, `05 Approvals`, `05b – empty`, `06 Seats`, `07 Profile`, `07b – no completed`

- [ ] **Step 1:** One `use_figma` script:
  - **04 New training:** the `h1` "New training", then a 720-wide form card containing:
    - TextField Name and Textarea Description
    - a row with DateTimeField Starts and DateTimeField Ends, with the help text "Times are in your local time"
    - Select Trainer (value "Diogo Pereira"), plus the option to choose External, which shows a TextField "External trainer name (optional)"
    - a Checkbox group "Levels" with all five levels (Senior and Architect checked)
    - TextField Max seats "12"
    - footer Buttons Cancel (ghost) and Create training (primary)
  - **04b – validation errors:** the Ends field is in the error state with "End must be after start"; the Levels group shows the error text "Choose at least one level" in `status/rejected/fg`; an error Alert at the top reads "Please fix 2 fields".
  - **04c Edit training:** the same form pre-filled, with the heading "Edit training", the footer buttons Save changes (primary) and Cancel training (danger).
  - **05 Approvals:** the `h1` "Approvals", the subtitle "Requests from your team", and four ApprovalRow instances with different employees and trainings.
  - **05b – empty:** an EmptyState reading "Nothing to approve".
  - **06 Seats:** the `h1` "Seats" and a weekday picker:
    - It covers the 10 weekdays from Mon 28 Sep to Fri 9 Oct 2026, as a row of pill chips (selected: `action/primary` fill with `text/on-brand`), with a caption "Bookings up to 2 weeks ahead · weekdays only".
    - Below it, the map: a grid of five zone groups (DKB, Deka, VV, DBIS, UNION), each a titled card with 10 Seat instances in two rows of five.
    - The user's client is DKB. DKB seats mix free, taken (3) and mine (DKB-03); every other zone uses `unavailable`.
    - A Tooltip instance is placed above a taken DKB seat.
    - On the right, a 320-wide panel holding a SeatLegend and a "Your seat on Wed 30 Sep" card with DKB-03 and a secondary Button "Cancel reservation".
  - **07 Profile:** the `h1` "Profile", a ProfileHeader instance, then three sections, each with an `h2` and a row of TrainingCards:
    - Upcoming: 2 cards, with the approved badge
    - Pending: 1 card, with the pending badge
    - Completed: 3 cards, with no badge and the caption "Completed"
  - **07b – no completed:** the Completed section is an EmptyState reading "No completed trainings yet".

  Return the frame names and their instance counts.
- [ ] **Step 2: Verify:** all 8 frames exist. `06 Seats` has at least 50 Seat instances (5 zones × 10) plus the Tooltip.

### Task 7: Audit, one visual check, and recording the file in the docs

**Files:**
- Modify: `CLAUDE.md` (the Design bullet: add the Figma file URL)
- Modify: `decisions.md` (the Visual design entry: add the URL and the `bg/inverse` and `text/inverse` tokens)
- Modify: `docs/superpowers/specs/2026-09-25-figma-design-design.md` (add `color/bg/inverse` and `color/text/inverse` to the semantic table)

- [ ] **Step 1:** One read-only `use_figma` audit script covering Review Focus #1, #2 and #5. It walks `Components` and `Screens` and returns:
  - `unboundPaints`: nodes with a SOLID fill or stroke that has no `boundVariables.color`, excluding `Cover` and `Foundations` labels
  - `smallBrandText`: TEXT nodes with `fontSize < 24` whose fill is bound to `color/brand/accent`
  - `screenNonInstances`: in each screen frame, direct children of the main content that are FRAMEs named like a component (TopBar, TrainingCard, Seat, StatusBadge, Button) but aren't INSTANCEs
- [ ] **Step 2:** Expect all three lists to be empty. If they aren't, fix the listed nodes with a follow-up script (bind the right token, or swap in an instance) and rerun the audit.
- [ ] **Step 3:** Spend exactly one read call: `get_screenshot` of the `06 Seats` frame, since it's the most complex. Check it for overlapping or clipped content and fix anything that's off.
- [ ] **Step 4:** Update the three docs listed above with the file URL and the two inverse tokens.
- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md decisions.md docs/superpowers/specs/2026-09-25-figma-design-design.md
git commit -m "Record PreyingMantis Figma file and inverse tokens"
```
