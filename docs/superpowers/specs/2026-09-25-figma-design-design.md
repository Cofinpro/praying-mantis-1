# PreyingMantis — Figma design system and page mocks

**Date:** 2026-09-25 · **Owner:** Bernardo (FE) · **Status:** Approved brief, spec for review

## Goal

A Figma file that is a real **handoff to code**: design tokens as Figma variables that mirror the CSS custom properties we'll use in CSS Modules one to one, real components with variants, and a desktop mock of every page we build. Figma is the reference, not a gate: code may diverge, and then Figma gets updated.

## Constraints

- Product name: **PreyingMantis** (the repo stays `praying-mantis-1`).
- **Cofinpro theming**, taken from www.cofinpro.pt: orange `#FD6202`, ink `#131313`, white, accents green `#60D391`, purple `#8242D8`, blue `#006CFF`; font **Inter**; pill buttons, 16px card corners.
- **Light mode only.** One variable mode, no dark mode.
- **Desktop only**, frames 1440 wide. Mobile is handled in code in FE-7.2.
- WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and UI shapes.
- The seat map never uses colour alone: every state has an icon and a text label as well.
- Mock data follows the API contracts in `plan.md`.

## 1. Tokens

Figma variable names use `/`, and each variable's WEB code syntax is the matching CSS variable: `color/text/primary` → `var(--color-text-primary)`.

### 1.1 Primitives (collection `Primitives`, hidden from publishing, used only by semantic tokens)

| Ramp | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| `orange` | #FFF3EB | #FFE2CC | #FFC299 | #FF9F5C | #FE7F2B | **#FD6202** | #D95400 | #C24A00 | #9A3B00 | #6B2900 |
| `neutral` | #F7F7F5 | #EFEFEC | #E2E2DE | #C9C9C4 | #9E9E98 | #6E6E6E | #525252 | #3A3A3A | #242424 | **#131313** |
| `green` | #ECFBF2 | #D3F5E1 | | | **#60D391** | | #2E9E5F | #1F7A47 | | |
| `red` | #FDECEE | #F9D0D5 | | | | #D6203A | | #A3122A | | |
| `blue` | #E6F0FF | | | | | **#006CFF** | | #0050BD | | |
| `purple` | #F3ECFC | | | | | **#8242D8** | | #6229AE | | |

Plus `neutral/0` = #FFFFFF.

### 1.2 Semantic colours (collection `Tokens`, one mode "Light")

| Token | Value | Use |
|---|---|---|
| `color/bg/canvas` | neutral/50 | page background |
| `color/bg/surface` | neutral/0 | cards, top bar, inputs |
| `color/bg/subtle` | neutral/100 | hover rows, secondary fills |
| `color/bg/brand-subtle` | orange/50 | selected nav item, highlights |
| `color/text/primary` | neutral/900 | body text (18.6:1) |
| `color/text/secondary` | neutral/600 | supporting text (7.8:1) |
| `color/text/muted` | neutral/500 | captions, placeholders (5.1:1) |
| `color/text/brand` | orange/700 | links, brand text (4.9:1) |
| `color/text/on-brand` | neutral/0 | text on primary buttons |
| `color/border/default` | neutral/200 | card and input borders |
| `color/border/strong` | neutral/300 | hovered inputs, dividers |
| `color/border/focus` | orange/500 | focus ring (3:1 as a UI shape) |
| `color/action/primary` | orange/700 | primary button fill |
| `color/action/primary-hover` | orange/800 | primary button hover |
| `color/action/danger` | red/500 | destructive button fill |
| `color/text/danger` | red/700 | error text, alert titles (added in FE-1.1) |
| `color/border/danger` | red/700 | input border in the error state (added in FE-1.1) |
| `color/bg/danger-subtle` | red/50 | error alert background (added in FE-1.1) |
| `color/brand/accent` | orange/500 | logo, decorative fills, large text only |
| `color/bg/inverse` | neutral/900 | tooltip background |
| `color/text/inverse` | neutral/0 | tooltip text |

Status badges (a `bg` and an `fg` token per status, all ≥ 4.5:1):

| Status | bg | fg |
|---|---|---|
| `pending` | purple/50 | purple/700 |
| `approved` | green/50 | green/700 |
| `rejected` | red/50 | red/700 |
| `withdrawn` | neutral/100 | neutral/600 |
| `cancelled` | neutral/100 | neutral/600 (with strikethrough on the training name) |

Seats (`color/seat/<state>/bg|fg|border`):

| State | bg | fg | border | Icon | Clickable |
|---|---|---|---|---|---|
| `free` | neutral/0 | neutral/900 | neutral/300 | none | yes |
| `taken` | red/500 | neutral/0 | red/700 | lock | no (tooltip only) |
| `mine` | green/400 | neutral/900 | green/700 | check | yes (already yours) |
| `unavailable` | neutral/100 | neutral/500 | neutral/200 | none, hatched | no |

Why crimson and not orange for "taken": the brand is orange, and an orange-red "taken" would read as brand colour.

### 1.3 Other tokens (collection `Tokens`)

- **Spacing** `space/1…16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px (`space/1`, `2`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, `16`)
- **Radius** `radius/sm` 8, `radius/md` 12, `radius/lg` 16, `radius/pill` 9999
- **Shadow** (effect styles): `shadow/sm` 0 1 2 rgba(19,19,19,.06); `shadow/md` 0 8 24 rgba(19,19,19,.10)
- **Text styles** (Inter):

| Style | Size / line | Weight |
|---|---|---|
| `display` | 40 / 48 | 700 |
| `h1` | 32 / 40 | 700 |
| `h2` | 24 / 32 | 600 |
| `h3` | 18 / 26 | 600 |
| `body` | 16 / 24 | 400 |
| `body-sm` | 14 / 20 | 400 |
| `label` | 14 / 20 | 500 |
| `caption` | 12 / 16 | 500 |

## 2. Components

Every component binds only to semantic tokens. Figma variants use the same prop names as the React component.

| Component | Variants |
|---|---|
| Button | variant: primary, secondary, ghost, danger · size: sm, md · state: default, hover, disabled · pill radius |
| TextField, Textarea, Select, DateTimeField | state: default, focus, error, disabled · label, help text, error text |
| CheckboxGroup (levels) | checked, unchecked, disabled |
| StatusBadge | pending, approved, rejected, withdrawn, cancelled |
| LevelTag | junior, expert, senior, architect, senior_architect |
| TrainingCard | default, hover · shows name, date, trainer, levels, seats left, optional status badge |
| ApprovalRow | default · employee, training, requested at, comment field, Approve / Reject |
| TopBar | logo, nav items, bell, avatar menu · Timesheets and Vacations as external links (↗) |
| NavItem | active, inactive, external |
| NotificationBell | no unread, unread (count badge) |
| NotificationItem | unread, read |
| Seat | free, taken, mine, unavailable × default, hover, focus · 68 × 56 so `UNION-10` fits |
| Tooltip | "Taken by <name>" |
| Alert | error, success |
| EmptyState | icon, title, text, optional action |
| Avatar | initials, size sm, md |
| Logo | orange mantis mark + "PreyingMantis" wordmark |

## 3. Pages (1440 wide, key states beside each main frame)

1. **Login** (`/login`): centred card with logo, email, password and "Log in". State: 401 error alert "Invalid email or password".
2. **Trainings list** (`/trainings`): heading, the user's level shown as a filter chip, a grid of TrainingCards. An admin sees "New training". State: empty ("No upcoming trainings for your level").
3. **Training detail** (`/trainings/:id`): name, date and time, trainer ("External – name" when external), levels, seats left, description, action panel. Main frame shows "Request to join". States: Pending (badge + Withdraw), Approved (badge + Withdraw), Full (disabled button, "No seats left"), Cancelled (banner, no actions).
4. **Create / edit training** (`/admin/trainings/new`, `/admin/trainings/:id/edit`): name, description, start, end, trainer (user select or External + optional name), levels (checkbox group), max seats. State: validation errors (end before start, no level chosen).
5. **Approvals** (`/approvals`): a list of pending ApprovalRows with an optional decision comment. State: empty ("Nothing to approve").
6. **Seats** (`/seats`): a weekday picker for the next two weeks (weekends and past days disabled), the map grouped by client zone (about 10 seats each, the user's zone clickable, others unavailable), a legend with icons and labels, and a "Your seat on <date>" summary. The Tooltip is shown open on a taken seat.
7. **Profile** (`/profile`): header card with avatar, name, email, client, level and team lead, then Upcoming, Pending and Completed sections of TrainingCards. State: Completed is empty.
8. **Notifications**: the Trainings page with the bell dropdown open (the latest items, unread first).

## 4. Figma file structure

File: https://www.figma.com/design/FFlbgdessRR1pHvP0MGpQh

Pages: `Foundations` (a cover frame at the top, then colour, type, spacing, radius and shadow swatches) · `Components` · `Screens`. The Starter plan caps a file at 3 pages, so there is no separate Cover page.

## 5. Out of scope

Dark mode, mobile frames, prototyping or interactions, and the Timesheets, Vacations and Expenses screens.
