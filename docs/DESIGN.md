# Cortex design philosophy

Cortex Pulse is the user-approved direction from 2026-10-15. The supplied Cortex logo sets the
palette: near-black charcoal, gold light and violet. This replaces the earlier restrained
Dayglide-inspired workspace. Colours live only in `src/renderer/styles/tokens.css`.

## Feeling and focus

Make progress satisfying to see. Use luminous fills, rich dark surfaces and a gold-to-violet
relationship, while keeping task titles and controls readable. Today is the home workspace:
progress first, then actionable lists, with the next task and schedule alongside.

The sidebar has four primary destinations and a compact spaces section. Capture and Atlas stay
in the top bar. Atlas is available when wanted; it does not dominate the task workspace.

## Progress and interaction

- Every counter comes from saved task or XP data. Never invent activity, streaks or statistics.
- Lists are existing parent tasks; children are their steps. Count children once, without also
  counting their parent. A standalone task contributes one step. Empty workspaces show zero.
- Drag handles reorder lists and steps. A child dropped on another open list heading moves there.
  Database mutations retain Undo and survive restart. Offer move buttons and keyboard shortcuts.
- Completing all steps fills the list bar. Completing the parent remains an explicit task action.
- Keep inline creation short. Editing details opens the existing task editor.

## Visual system

- Bricolage Grotesque for headings and numbers, the body sans for reading and controls. Bundle
  fonts for offline use. Use sentence case, clear spacing and visible keyboard focus.
- Gold identifies progress and capture. Violet adds depth and identifies Atlas. Area colours
  continue to identify the user's spaces. Resolve all colours through semantic tokens.
- Use charcoal surface steps, thin illuminated edges and soft ambient glows. Progress fills get
  the strongest light. Text itself stays crisp. A top-bar control softens the glow.
- List cards communicate hierarchy; avoid unrelated grids of decorative cards.
- Motion must not compete with reading or typing. Respect `prefers-reduced-motion`; no flashing.
- Check text against the actual composited surface. Reading text should meet 4.5:1 contrast.

## Product rules

- Never guilt. Unfinished earlier work is carried forward. Wins come from real completion.
- No surprise speech; voice remains off by default and respects quiet hours.
- The offline core must work without an API key, network or VoiceStudio.
- Keep the existing focus screen, editor, board, capture shorthand, rituals and Undo accessible.
- Avoid decorative AI language, emoji icons, fake metrics and moving distractions.

## Verification

Inspect the real Electron app at desktop and narrow widths. Exercise completion, progress,
creation, dragging, keyboard movement, Undo and restart persistence. Check reduced motion and
error states. Use the repository's static, unit and end-to-end checks before release.
