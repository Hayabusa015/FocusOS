# Cortex design philosophy

How Cortex should look and feel. It is for one teacher with ADHD, at a desk, many times a day. This
file is read by whoever builds or changes the interface (a person or an agent) before they touch it.

**It states principles, not values.** Colours live only in `src/renderer/styles/tokens.css`, and
nothing here repeats a hex code (CLAUDE.md rule 3). Where this file names a colour it names the
token. If a principle here and the plan disagree, `docs/PLAN.md` wins.

## 1. The feeling

Calm, dry, precise, a little British, like Atlas. The screen should lower the user's heart rate:
one clear next thing, then quiet. Personality comes from craft and motion, never from decoration.

- Dark, near-black ground with gold as the accent and violet for Atlas. Area colours mark meaning
  (a class, a kind of task), nothing else.
- Fewer boxes. Sections sit on the page and are divided by thin rules.
- Glow is information: a lit fill means progress. It is never ambient.
- Motion is short and springy and always means something moved (a page changed, a block began). It
  is switched off under `prefers-reduced-motion`.

## 2. One peak per screen

Borrowed from scroll-craft's "engineered peak": a screen with three focal points has none.

- Every page names its one thing: the Dashboard's is the day gauge, Today's is the block you are
  in, Focus's is the timer, the morning briefing's is the first task.
- That thing gets the size, the contrast, the glow and the empty space around it. Everything else
  steps back.
- Before adding anything to a page, say which feeling it serves. Two neighbouring areas that feel
  the same mean one of them is filler.

## 3. Typography floor

- Two families at most: the body sans and the display face (Bricolage Grotesque, bundled so it works
  offline). Headings and big numbers use the display face; everything else the sans.
- Tracking tightens as size grows. Lines of reading text run 45 to 75 characters; the shorter the
  line, the more generous the line height.
- Light text on a dark ground is slightly lighter-weight and slightly looser than the same text the
  other way round. Check it, don't assume it.
- Labels are plain sentence case. No all-caps shouting, no letter-spaced eyebrow labels.

## 4. Spacing and rhythm

- A 4 px base. More space above a heading than below it, so a heading belongs to what follows.
- Group by proximity before reaching for a border or a card.
- Density follows the task: lists are tight, the briefing and the focus screen are spacious.

## 5. Colour roles

- Use roles, not shades: ground, surface, raised, line, ink, ink-muted, accent, win, caution, alert,
  plus the area colours. Add a token to `tokens.css` before using a new colour anywhere else.
- One accent per screen. Secondary text is tinted toward the ground, not flat grey. No pure black.
- Body text meets at least 4.5:1 on the surface it really sits on, measured on the composited
  result (over glow, grain and tinted areas), not on the token pair alone.

## 6. Depth

Five tools, used lightly and in this order: surface steps (ground, surface, raised), a violet-tinted
shadow for sheets, an edge light on raised things, overlap, and grain so flat colour doesn't look
flat. Never stack all five on one element.

## 7. Signature moves

Each product earns one or two bespoke touches that exist nowhere else. Cortex's are the springing
gold highlight in the side nav and the lit, day-aware gauge. New "personality" work should extend
one of these or propose a third, rather than adding a generic effect.

## 8. The refuse list

These make an interface look machine-made. Don't add them:

- identical grids of feature cards, `01 / 06` counters, decorative scroll cues
- gradient text, AI-purple gradients, fake dashboards, invented statistics
- em dashes in UI copy
- emoji as icons, confetti that isn't earned by a real win
- anything that moves while the user is trying to read or type

## 9. ADHD-specific rules

- One next step, never a list, when the user is overwhelmed (matches Atlas's persona).
- Never guilt. Overdue is "still on deck". Wins are stated plainly.
- No surprise sound or speech. Voice is off by default and obeys quiet hours.
- Everything reachable by keyboard. Focus states are visible.
- The offline core must look and work the same with no key, no network and no VoiceStudio.

## 10. Checking your work

- Run the app and look at it (`npm run dev`), at the real window size and at a narrow one.
- Measure contrast per line on the composited page, as above.
- Turn on reduced motion and check nothing is lost.
- Look for dead interaction: hover, press and focus states on everything clickable.

## Where this came from

Principles adapted from the [scroll-craft](https://github.com/nateherkai/scroll-craft) design
skill (MIT): the feeling curve and single engineered peak, the typography and spacing floor, colour
roles with one accent, depth as separate tools, a required signature move, and a refuse list.
scroll-craft is for scroll-driven marketing sites, so its page grammars, scroll devices, scrubbed
video and fingerprint registry are deliberately left out: Cortex is a desktop app, not a page.
