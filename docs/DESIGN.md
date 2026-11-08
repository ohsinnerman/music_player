# Design system

## Direction

**Content-first darkness, wrapped in liquid glass.** The interface is near-black so album art is the
only real colour (Spotify's principle). Floating controls are frosted, rim-lit glass that lets that
colour bleed through (Apple's iOS 26 Liquid Glass). Motion is physical — springs, not tweens — and
always on the UI thread.

### Inspirations and what we took

| Source | Taken |
|---|---|
| **Apple Music (iOS 26)** | Floating glass tab bar that minimises on scroll; mini player attached to it; full player with the cover shrinking when paused; living blurred-artwork background; lyrics where the active line is bright and the rest recede; title marquee |
| **Spotify** (via `awesome-design-md/spotify`) | Near-black surfaces `#08080B`–`#1C1C24`; album art as the colour source; pill & circle geometry; bold/regular weight binary; heavy shadows only where something floats; "Jump back in" grid |
| **liquid-glass-js** | The glass layer model: blur → tint → edge rim brighter at the top → specular sheen; edge "lip" highlight. Re-implemented natively with one blur + two gradients (no per-frame shaders) |
| **taste-skill** | Restraint: one system (one button pair, one radius scale, one press interaction), no fade-in-on-scroll, a single entrance moment, 44 dp targets, contrast, reduced-motion respected, **no violet** |
| **YouTube Music** | Quick picks: paged columns of four rows |
| **Editorial music press** | Instrument Serif italic for greetings and chart numerals, as a counterpoint to the tight grotesk |
| **Apple design-md** | Negative letter-spacing on large titles; chrome that recedes; one interactive colour |

## Tokens (`mobile/src/theme`)

**Colour**

| Token | Value | Use |
|---|---|---|
| `bg` | `#08080B` | App background |
| `surface` / `surfaceHigh` | `#15151B` / `#1C1C24` | Placeholders, cards |
| `text` | `#F5F5F7` | Primary text |
| `textSecondary` / `Tertiary` | 64% / 40% white | Metadata, hints |
| `accent` | `#FF5A36` ("ember") | Things you can act on: play buttons, active states, current track |
| `glassTint` | `rgba(22,22,28,0.52)` | Over blur |
| `success` / `danger` / `warning` | `#3DDC97` / `#FF6B6B` / `#FFB13B` | Feedback only |

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
| `liquid` | 18 / 260 | Tab lens travel (with a brief 14% stretch) |

Press = scale to 96.5% on a spring, everywhere (`PressableScale`). Haptics only on meaningful
actions (play/pause, like, tab switch, success/error).

## Signature components

**Glass** (`components/ui/Glass.tsx`) — `overlay` variant blurs the real content beneath (Android 12+
RenderNode blur via `BlurTargetView`), `inline` variant (inside scroll views) uses a frosted fill on
Android to avoid recursive blur. "Reduce transparency" swaps to solid.

**Glass dock** — tab pill + search circle. A glass lens slides between tabs with a liquid stretch.
Scrolling down collapses the pill into a single circle and slides the mini player down beside it;
scrolling up restores it.

**Player sheet** — one continuous surface driven by a single shared value `p` (0 = mini, 1 = full):
frame, corner radius, glass ↔ living background cross-fade and content opacity all interpolate from
`p`. The cover is a separate shared element that flies from the mini thumbnail to the hero position
(and to a small header thumb when lyrics/queue are open). Drag the mini up or the full player down;
release velocity decides where it lands.

**Living background** — Skia canvas at ⅕ screen size: two huge blurred copies of the cover orbiting
plus two palette blobs, scaled up 5× by the GPU. Stops animating when the player is closed or
reduce-motion is on.

**Lyrics** — active line computed on the UI thread by binary search over line times; lines animate
opacity/scale; auto-scroll keeps the active line ~30% from the top and pauses for 3.5 s after you
scroll manually; tap a line to seek. A pulsing "• • •" fills long intros.

**Scrubber** — no thumb; the bar thickens 5→10 dp while dragged, labels follow the finger, seeking
happens on release.

## Accessibility

- All icon buttons have labels and ≥44 dp targets; rows describe "title by artist" and hint at long-press.
- Text scales up to 135%; colours meet contrast on the dark background.
- Reduce motion: living background and onboarding wall stop moving.
- Live regions for toasts and form errors.

## Do / don't

- **Do** let artwork carry colour. **Don't** add new brand colours or use violet.
- **Do** use glass only for floating chrome. **Don't** stack glass on glass.
- **Do** keep one primary action per area (the ember play button). **Don't** use accent decoratively.
- **Do** animate with springs on the UI thread. **Don't** fade things in on scroll.
