# Design system

## Direction

**Content-first darkness in solid, layered chrome.** The interface is near-black so album art is the
only real colour (Spotify's principle). Floating controls are solid surfaces one step lighter than the
page, with a hairline edge, a faint light along the top and a soft shadow — the same on every phone,
nothing to blur. (1.2.6 removed the earlier Liquid Glass chrome; it didn't render reliably.) Motion is
physical — springs, not tweens — and always on the UI thread.

### Inspirations and what we took

| Source | Taken |
|---|---|
| **Apple Music (iOS 26)** | Floating tab bar that minimises on scroll; mini player attached to it; full player with the cover shrinking when paused; living blurred-artwork background; lyrics where the active line is bright and the rest recede; title marquee |
| **Spotify** (via `awesome-design-md/spotify`) | Near-black surfaces `#08080B`–`#1C1C24`; album art as the colour source; pill & circle geometry; bold/regular weight binary; heavy shadows only where something floats; "Jump back in" grid |
| **taste-skill** | Restraint: one system (one button pair, one radius scale, one press interaction), no fade-in-on-scroll, a single entrance moment, 44 dp targets, contrast, reduced-motion respected, **no violet** |
| **YouTube Music** | Quick picks: paged columns of four rows |
| **Editorial music press** | Instrument Serif italic for greetings and chart numerals, as a counterpoint to the tight grotesk |
| **Apple design-md** | Negative letter-spacing on large titles; chrome that recedes; one interactive colour |

## Tokens (`mobile/src/theme`)

**Colour**

| Token | Value | Use |
|---|---|---|
| `bg` / `bgRaised` | `#09090C` / `#0F0F14` | App background |
| `surface` / `surfaceHigh` | `#16161D` / `#1E1E27` | Placeholders, cards, fields |
| `chrome` | `#18181F` + `chromeBorder` 9 % white + `chromeSheen` | Floating chrome: dock, mini player, sheets, toasts |
| `bar` | `bg` at 97 % | Top bar that content scrolls under |
| `scrimSurface` | 42 % black | Controls over artwork (back button, hero "Open" pill) |
| `text` | `#F5F5F7` | Primary text |
| `textSecondary` / `Tertiary` | 64% / 40% white | Metadata, hints |
| `accent` | `#FF5A36` ("ember") | Things you can act on: play buttons, active states, current track |
| `success` / `danger` / `warning` | `#3DDC97` / `#FF6B6B` / `#FFB13B` | Feedback only |

**Light theme** (`lightColors`, Settings → Appearance: System / Light / Dark) — white `#FFFFFF`
background, `#0B0B0F` text with 62 / 44 % secondary/tertiary, ink-tinted fills instead of white ones,
ember accent nudged to `#F04824` for contrast on white, white chrome with an ink hairline. Styles are
written once as `makeStyles((colors) => …)` and cached per palette. The **full player stays dark** in
light mode (`<ThemeScope scheme="dark">`): it sits on artwork colour, and the lyrics read best light-on-dark.

The player and detail pages add **dynamic colour** extracted from the cover on-device
(`lib/palette.ts`): `dominant`, `vibrant`, `dark` (safe under white text) and `light`.

**Type** — Plus Jakarta Sans (400–800) for UI; Instrument Serif Italic for display moments.

| Variant | Size/Line | Weight | Tracking |
|---|---|---|---|
| `display` | 44/48 | serif italic | −0.5 |
| `largeTitle` | 32/38 | 800 | −1.0 |
| `title1` | 26/32 | 800 | −0.7 |
| `title2` | 21/27 | 700 | −0.45 |
| `title3` | 17/22 | 700 | −0.25 |
| `headline` | 15/20 | 600 | −0.15 |
| `body` | 15/21 | 500 | −0.1 |
| `caption` | 13/17 | 500 | 0 |
| `label` | 11/14 | 700 caps | +1.1 |
| `lyric` | 28/36 | 800 | −0.6 |

**Spacing** 2·4·8·12·16·20·24·32·48, page gutter **20 dp**.
**Radius** 6 · 10 · 14 · 20 · 28 · 36 · pill.

**Motion** (`theme/motion.ts`)

| Spring | damping/stiffness | For |
|---|---|---|
| `snappy` | 22 / 320 | Press feedback, toggles |
| `sheet` | 28 / 240 | Player and bottom sheets (velocity-aware release) |
| `smooth` | 30 / 200 | Dock collapse, panel switches |
| `bouncy` | 18 / 260 | Dock highlight travel (with a brief 14% stretch), tab icon pop, segmented controls |

Press = scale to 96.5% on a spring, everywhere (`PressableScale`). Haptics only on meaningful
actions (play/pause, like, tab switch, success/error).

## Signature components

**Surface** (`components/ui/Surface.tsx`) — the one chrome primitive. Tones: `overlay` (raised `chrome`
colour, top sheen gradient, elevation 10 / soft shadow — dock, mini player, sheets, toasts, cast volume),
`inline` (`surface` — search field, sign-in card), `bar` (top bar), `scrim` (dark wash with a light edge
over artwork). Optional `tint` for a colour wash (album colour on the mini player, green / red on success
/ error toasts). No blur, no native view: identical on Android, iOS and web, and free to draw.

**Dock** (`components/dock/Dock.tsx`) — tab pill + search circle on `overlay` surfaces. An ember
highlight (`accentSoft` with an accent edge) slides between tabs with a brief stretch; the active tab's
icon cross-fades from grey to ember with a small pop and its label brightens.
Scrolling down collapses the pill into a single circle and slides the mini player down beside it;
scrolling up restores it.

**Player sheet** — one continuous surface driven by a single shared value `p` (0 = mini, 1 = full):
frame, corner radius, mini surface ↔ living background cross-fade and content opacity all interpolate from
`p`. The cover is a separate shared element that flies from the mini thumbnail to the hero position
(and to a small header thumb when lyrics/queue are open). Drag the mini up or the full player down;
release velocity decides where it lands.

**Living background** — Skia canvas at ⅕ screen size: two huge blurred copies of the cover orbiting
plus two palette blobs, scaled up 5× by the GPU. Stops animating when the player is closed or
reduce-motion is on.

**Lyrics** — active line computed on the UI thread by binary search over line times; lines animate
opacity/scale; auto-scroll keeps the active line ~30% from the top and pauses for 3.5 s after you
scroll manually; tap a line to seek. A pulsing "• • •" fills long intros.

**Quality badge** — the player's bottom-bar chip: gold `HI-RES 24/96` for hi-res lossless,
`LOSSLESS 16/44.1`, or a plain `MP3 320`. Tapping it opens the **Audio quality** sheet: a tier header
with a 5-bar meter, a vertical *How it's playing* stepper (file → decode → mixer → output) whose dots
use `success` / `warning` / `danger` for clean / compromise / lossy, a verdict card and a details grid.
Lists show a tiny `HI-RES` / `LOSSLESS` tag, styled like the preview tag. Gold is the only extra hue and is
reserved for Hi-Res. See [AUDIO_QUALITY.md](AUDIO_QUALITY.md).

**On this phone** — blue-gradient collection art (the one non-artwork colour block, so device music is
recognisable at a glance), add-files / add-folder / find-lyrics actions, a progress card during import.

**Scrubber** — no thumb; the bar thickens 5→10 dp while dragged, labels follow the finger, seeking
happens on release.

## Accessibility

- All icon buttons have labels and ≥44 dp targets; rows describe "title by artist" and hint at long-press.
- Text scales up to 135%; colours meet contrast on both the dark and the light background.
- Reduce motion: living background and onboarding wall stop moving.
- Live regions for toasts and form errors.

## Do / don't

- **Do** let artwork carry colour. **Don't** add new brand colours or use violet.
- **Do** use `Surface` tones for chrome. **Don't** stack an overlay surface on another overlay surface.
- **Do** keep one primary action per area (the ember play button). **Don't** use accent decoratively.
- **Do** animate with springs on the UI thread. **Don't** fade things in on scroll.
