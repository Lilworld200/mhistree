# Design System Breakdown — Fintech Balance Card
### Reverse-engineered from the uploaded screenshot (pixel-sampled, not eyeballed)

---

## 0. Method, and where this data is honest vs. approximate

I didn't guess these values. I cropped the artifact out of your black export frame, then wrote small Python/PIL scripts to sample actual pixel RGB values at dozens of coordinates (gradient corners, button fills, shadow falloff curves, corner-radius arcs). That's why the numbers below are specific instead of "looks kinda blue."

Two honesty flags before you use any of this in production:

1. **Source is a compressed JPEG screenshot, not a Figma/Sketch file.** Every hex value here has roughly ±3–5 RGB units of compression noise. Treat them as "correct to the eye" reference points, not pixel-law. If you have the source file, re-pick colors from that instead of trusting this document as ground truth.
2. **The outer light-gray rounded square with the big soft shadow is presentation chrome** — it's the Dribbble-shot mockup frame, not part of the actual product UI. I've documented it separately (§3.1) because the shadow technique is worth stealing, but don't confuse it with the app's own component library.

---

## 1. What this system actually *is*

Strip away the specific numbers and the philosophy is one sentence:

> **A quiet two-tone gray base, one confident blue accent, and a single repeated "glossy top-left light source" motif that appears on exactly two elements — the hero panel and the primary button — to visually bind them together as the two things on screen that matter.**

Everything else (avatars, list rows, secondary buttons) is deliberately flat and low-contrast so it doesn't compete with those two elements. That restraint is the actual skill on display here, more than any individual color choice.

---

## 2. Global tokens

### 2.1 Color

| Token | Hex (measured) | Where it's used | Note |
|---|---|---|---|
| `--surface-backdrop` | `#EEEEEE` | Outer mockup frame only | Presentation chrome, not app UI |
| `--surface-card` | `#E1E1E1` | The card's own body fill | **Not white.** See §5 — this is the single most-missed detail if someone eyeballs this instead of sampling it |
| `--surface-keyline` | `~#F8FAFF` (near-white) | 2–3px stroke around card edge and around the blue panel edge | Thin hairline, not a fill |
| `--accent-blue-highlight` | `#8CC9FF` | Lightest point of the hero gradient | Radial highlight |
| `--accent-blue-base` | `#4786EF` | Darkest/edge point of the hero gradient | Most saturated toward bottom-right |
| `--ink-primary` | `#1A1A1A` (est.) | Transaction title, dollar amount, Send-button text (inverted) | Never pure `#000000` |
| `--ink-muted` | `#9A9A9A` | Timestamps, "Last Transaction" label | |
| `--ink-link` | `#7A7A7A` | "View all" | Slightly darker than muted — implies interactivity without color |
| `--btn-primary-highlight` | `#4A4A4A` | Top-left of Send button | Mirrors the blue panel's light source |
| `--btn-primary-base` | `#0A0A0A` | Bottom-right of Send button | Not flat black — it's a gradient |
| `--btn-secondary-fill` | `#EDEDED` | Receive pill, gear icon, NFC icon | All three secondary controls share one fill |
| `--icon-stroke-muted` | `#8A8A8A` | Gear / NFC glyphs | |
| `--avatar-pink` | `#F4A8AC` | Avatar ring 1 | Pastel, ~85% lightness |
| `--avatar-green` | `#B7E4C7` | Avatar ring 2 | |
| `--avatar-peach` | `#FBD9A0` | Avatar ring 3 | |
| `--avatar-tan` | `#F0C087` | Avatar ring 4 | Too close to ring 3 — flagged in §5 |
| `--avatar-lavender` | `#C7C6F2` | Avatar ring 5 | |
| `--icon-brand-pink` | `#FF7FD1 → #C2237E` (radial) | Dribbble transaction icon only | The palette's *one* sanctioned exception — see Principle 7 |

### 2.2 Radius scale

Everything maps to one of three tiers. Absolute pixel values are meaningless without knowing the export scale, so I'm giving you the **ratio**, which is what's actually portable:

| Tier | Ratio | Applied to |
|---|---|---|
| **Large / squircle** | ≈ 10% of the element's own width | Outer frame, hero blue panel |
| **Medium / squircle** | ≈ 6–8% of the element's own width | Card container, inset list module |
| **Full / pill or circle** | 50% of height | All buttons, all avatars, all icon chips |

The rule underneath the rule: **static containers get a proportional squircle radius; anything tappable or anything representing a person gets full radius.** Roundness is being used as an affordance signal, not just a style choice.

### 2.3 Elevation / shadow

| Level | Spec (approx.) | Used on |
|---|---|---|
| Ambient | Large blur (~140px falloff in this scale), ~6–8% black opacity, soft downward offset | Card floating over the backdrop |
| Flat / none | No measurable shadow | Gear icon, NFC icon, Receive pill |
| Elevated | Tight, ~2× darker than ambient at the same distance | **Send button only** |

I measured this directly: the pixel value directly under the Send button drops to ~108 (on a 0–255 scale) while the same distance under the Receive button only drops to ~221. That's not a rounding error — someone deliberately gave the primary CTA a harder shadow than its siblings. Elevation is being used as a hierarchy signal, same as the radius rule above.

### 2.4 Typography

- **Family:** rounded/geometric sans-serif — soft terminals on numerals, looks closer to SF Pro Rounded / Manrope / General Sans than a standard grotesk. I can't confirm the exact family from a raster image; pick any of those three as a safe substitute.
- **Weight roles observed:**
  - Heavy/Bold — balance amount, transaction amount, primary button label
  - Medium — username, transaction title, secondary button label
  - Regular, reduced opacity or muted gray — timestamps, eyebrow labels
- Numerals appear to use tabular/lining figures (the balance digits align cleanly) — worth enforcing explicitly with `font-variant-numeric: tabular-nums` in implementation, since browsers won't guarantee this by default.

### 2.5 Spacing

Consistent generous padding inside every container (card edge, panel edge, list module edge all use roughly the same inset). Vertical rhythm between stacked elements (name row → balance label → balance amount → avatar row) is even, not cramped — this is a big part of why it reads as "premium" rather than "dense." If you compress the vertical spacing when reusing this system, you'll lose most of the effect.

---

## 3. Component-by-component breakdown

### 3.1 Elevation Frame (presentation chrome — not app UI)

- **Fill:** `#EEEEEE`
- **Radius:** ~10% of frame width
- **Shadow:** none of its own (it's the shadow *caster* for the card, not the receiver)
- **Philosophy:** This is a Dribbble-shot device frame, included so the mockup pops off a dark background. Steal the *technique* (a neutral gray backdrop one shade lighter than the card, so the card reads as "floating" via fill contrast, not just shadow) — don't literally rebuild this frame into a product.

### 3.2 Card Surface

- **Fill:** `#E1E1E1` — a full 13 points darker than the backdrop, not white
- **Border:** ~2–3px near-white keyline
- **Radius:** medium tier (~6–8% of width)
- **Shadow:** ambient, large and soft
- **Philosophy:** The card doesn't separate itself from the backdrop with a big color jump — it's gray-on-gray with a thin white line doing the actual separating. This is a subtler, more expensive-looking technique than "white card on gray page," and it's the detail most likely to get lost if someone recreates this from memory instead of sampling it.

### 3.3 Hero Gradient Panel (the balance display)

- **Gradient type:** **radial**, not linear. Light source sits at roughly 35% across / 22% down from the panel's top-left — noticeably off-center, not a corner-to-corner diagonal.
- **Highlight:** `#8CC9FF`
- **Base:** `#4786EF`, darkest toward the bottom-right corner
- **Radius:** large tier (~10% of panel width)
- **Border:** same white keyline as the card
- **Internal layout:** identity row (avatar + name, left) and utility icon (bell, right) share the top edge; the label chip and the big number are centered as their own visual block below that; the whole thing is capped by the avatar row punching through the bottom edge.
- **Philosophy:** This is the loudest element on the screen by design — full saturation, full contrast, largest text. Everything else in the system exists specifically to *not* compete with this panel.

### 3.4 Translucent Pill Chip ("Your balance")

- **Fill:** white at roughly 15–20% opacity over the gradient beneath it
- **Border:** white at roughly 35–40% opacity, 1px
- **Radius:** full/pill
- **Text:** white, reduced opacity relative to the balance number below it, to keep it visually secondary
- **Philosophy:** A translucent chip lets the same component sit correctly on *any* background shade — it inherits the panel's own color instead of needing a hardcoded fill. That's the actual reason to build a chip this way instead of giving it a solid color: portability across contexts.

### 3.5 Avatar / Contact Stack

- **Ring colors:** five distinct pastels, see token table
- **Border:** white ring, ~3–4px, uniform across all five
- **Shape:** full circle, uniform diameter
- **Positioning:** the row sits centered on the panel's bottom edge — each circle is roughly 35–40% "tucked under" the panel and 60–65% exposed on the card body below it
- **Philosophy / implementation note:** that straddle is doing real depth work — two surfaces (blue panel, gray card) with one object bridging both, which reads as physical layering without needing an extra shadow. **This is also the easiest part of the whole system to build wrong.** If you just place the avatar row in normal document flow below the panel, you lose the entire effect. You need the avatars absolutely/negatively positioned so they overlap the panel's bottom edge, with z-index above the panel and (ideally) their own drop shadow so they read as sitting *on top of*, not *behind*, the blue surface.

### 3.6 Inset List Row (transaction item) — generalize this as a reusable pattern

- **Container fill:** same family as the card (~`#E1E1E1`–`#E8E8E8`), distinguished mainly by a thin ~1px stroke, not a fill-color jump
- **Radius:** medium tier, smaller absolute value than the hero panel — establishes a visible size/importance hierarchy just through radius alone
- **Row anatomy, left to right:** icon chip (colored circle, white ring, brand-colored radial fill) → stacked title/subtitle (bold near-black title, muted gray subtitle) → trailing right-aligned bold amount
- **Header row above it:** muted label left, muted-but-slightly-darker "action" link right — this label/action pairing is a reusable pattern for *any* list module in this system, not just transactions

### 3.7 Icon-Only Circular Button (settings, NFC)

- **Fill:** `#EDEDED` — nearly identical to the card's own background
- **Border:** none
- **Icon stroke:** `#8A8A8A`, thin
- **Shape:** perfect circle, same height as the pill buttons beside it
- **Philosophy:** Deliberately the lowest-emphasis control in the system — flat, no shadow, low contrast against its own container. See §5 for why this is also its biggest risk.

### 3.8 Secondary Pill Button (Receive)

- **Fill:** `#EDEDED`, same as the icon buttons — same visual tier
- **Text/icon:** near-black
- **Radius:** full/pill
- **Shadow:** none
- **Philosophy:** Secondary actions get the same non-treatment as pure utility icons. That's a real hierarchy decision, not an oversight — "Receive" is deliberately not competing with "Send."

### 3.9 Primary Pill Button (Send)

- **Fill:** radial/linear dark gradient, `#4A4A4A` top-left → `#0A0A0A` bottom-right — **the exact same light-source direction as the hero panel.** This is the single strongest piece of evidence that this is an intentional design *system* and not a one-off screen: the same lighting rule was applied to two completely different components.
- **Text/icon:** white, bold
- **Radius:** full/pill, but wider than its neighbors (more horizontal padding)
- **Shadow:** measurably harder/darker than every other button in the row (§2.3)
- **Philosophy:** Three separate signals — gradient direction, width, shadow strength — all point at this one button. That redundancy is what makes hierarchy read instantly instead of requiring the user to think about it.

---

## 4. The cross-cutting rules (this is the part you actually reuse)

1. **Never use pure white or pure black for a surface.** Card fill is `#E1E1E1`, primary button base is `#0A0A0A`. Reserve true white/black for text and for gradient *highlights*.
2. **One accent hue carries all the emotional weight.** Blue appears exactly once, at full strength, in exactly one place. Every other surface is achromatic. Don't dilute this by adding a second "friendly" accent color somewhere else — it'll fight the hero panel for attention.
3. **Radius encodes hierarchy, not just taste.** Large static content = proportional squircle (~8–10% of width). Anything tappable or human = full round. If you're building a new component and can't decide on a radius, ask "is this a container or a control?" — that answers it.
4. **Repeat one gradient rule across your most important surface and your most important control.** Here it's top-left-light-source, applied to the hero panel and the primary CTA and nowhere else. Pick your own light-source direction if you're adapting this, but apply it in at least two places or the "system" feeling disappears and it just looks like decoration.
5. **Elevation should be scarce and meaningful.** Only one control in this entire card has a genuinely harder shadow than its neighbors, and it's the primary action. If everything has a shadow, shadow stops communicating anything.
6. **Overlap is a cheap depth trick — use it once, deliberately.** The avatar row straddling two surfaces is doing more perceived-depth work than any shadow in this file. It only works because it's used exactly once; if every component overlapped its neighbor this would look broken instead of intentional.
7. **Brand icon colors are the one allowed exception to your palette.** The Dribbble icon's hot pink doesn't appear anywhere else in the system, and that's correct — third-party/brand marks are allowed to bring their own color in a way nothing else in your UI should. Document this as an explicit exception, or the next person building a component will think pink is now fair game for a random button.

---

## 5. Where I'd actually push back — faults and risks

You asked me not to just nod at this, so here's what's genuinely weak or risky if you carry it forward as-is:

- **Contrast is not guaranteed across the gradient.** White text sits fine on the darker `#4786EF` zone, but the "Your balance" chip's translucent white text is positioned right over the *lightest* part of the gradient (`#8CC9FF`). White-on-light-blue is a materially worse contrast ratio than white-on-mid-blue, and depending on exact opacity this is plausibly failing WCAG AA for that specific chip. A radial highlight sitting directly under a text element is a genuinely risky pairing — either move the chip off the highlight's center, or add a subtle scrim behind the text so contrast doesn't depend on gradient position.
- **The icon-only buttons have almost no affordance.** `#EDEDED` fill on an `#E1E1E1` card is roughly a 5-point difference on a 0–255 scale — barely perceptible. Combined with zero border and zero shadow, these two buttons are borderline invisible as *tappable* elements next to a card that otherwise uses shadow and gradient aggressively to signal interactivity. This isn't a stylistic nitpick, it's a real discoverability problem on a financial app where "the settings button" and "the NFC button" are things people need to find.
- **Two of your five avatar colors are doing the same job.** Ring 3 (`#FBD9A0`) and ring 4 (`#F0C087`) are both peach/orange and sit close enough that they don't reliably read as *different people* at a glance, which defeats the actual purpose of color-coding a contact stack. If this pattern is meant to help someone distinguish teammates quickly, that's a palette bug, not a style choice.
- **"Dribble Pro."** If this is meant to reference the design platform, it's missing a "b" — the real name has three. Worth a proofread pass regardless of whether it's intentional placeholder copy.
- **"Jan 22 · 22:12" is an odd pairing.** A calendar date next to a 24-hour clock time with no day-of-week and no AM/PM convention stated anywhere else in the card is the kind of thing that reads fine in isolation and then looks inconsistent the moment it sits next to a second timestamp formatted differently elsewhere in the app. Lock a date/time format convention before this pattern gets reused.
- **This system has no defined semantic colors.** There's no red for a failed transaction, no green for a positive balance change, no amber for a warning — just blue (brand), black (primary action), and grays. The moment you need to design an error state, a "money received" state, or a low-balance warning, you're making that decision from scratch with nothing in this artifact to anchor it. Decide your semantic palette *before* you need it, not while you're mid-panic building an error toast.
- **Every hex code in this document came from a JPEG.** I sampled real pixels, but JPEG compression means anti-aliasing and block artifacts add noise, especially at edges and around text. If this ever ships, get the values from source files, not from re-measuring a screenshot — treat this document as a very informed starting point, not a spec sheet.

---

## 6. Ready-to-use tokens

```css
:root {
  /* Surfaces */
  --surface-backdrop: #EEEEEE;
  --surface-card: #E1E1E1;
  --surface-keyline: #F8FAFF;

  /* Accent gradient (hero panel) */
  --accent-blue-highlight: #8CC9FF;
  --accent-blue-base: #4786EF;
  --gradient-hero: radial-gradient(
    circle at 35% 22%,
    var(--accent-blue-highlight) 0%,
    var(--accent-blue-base) 75%
  );

  /* Primary button gradient — same light source as hero */
  --btn-primary-highlight: #4A4A4A;
  --btn-primary-base: #0A0A0A;
  --gradient-primary-btn: radial-gradient(
    circle at 25% 20%,
    var(--btn-primary-highlight) 0%,
    var(--btn-primary-base) 80%
  );

  /* Secondary controls */
  --btn-secondary-fill: #EDEDED;
  --icon-stroke-muted: #8A8A8A;

  /* Text */
  --ink-primary: #1A1A1A;
  --ink-muted: #9A9A9A;
  --ink-link: #7A7A7A;
  --ink-on-accent: #FFFFFF;

  /* Avatar palette */
  --avatar-pink: #F4A8AC;
  --avatar-green: #B7E4C7;
  --avatar-peach: #FBD9A0;
  --avatar-tan: #F0C087; /* consider replacing — too close to peach */
  --avatar-lavender: #C7C6F2;

  /* Radius scale */
  --radius-large: 10%;   /* use as border-radius relative to element width via clamp/calc, or fix in px per breakpoint */
  --radius-medium: 7%;
  --radius-full: 999px;

  /* Elevation */
  --shadow-ambient: 0 20px 60px rgba(0, 0, 0, 0.07);
  --shadow-elevated: 0 10px 24px rgba(0, 0, 0, 0.28);
  --shadow-none: none;
}
```

---

## 7. Generative recipe — building a *new* component in this system

Give this checklist to a developer or an agent building something new (a modal, a settings screen, a new card type) so it inherits the same philosophy instead of just the same colors:

1. **Pick the container's job first: content or control?** Content → proportional squircle radius (6–10% of its own width) and the two-tone gray fill rule. Control (button, chip, avatar) → full radius.
2. **Budget your accent hue.** You get one saturated color per screen for the "this matters most" element. Everything else stays achromatic. If you already used blue for the hero, a new screen's hero gets to reuse blue — it doesn't get a second accent color competing with it.
3. **If you add a primary CTA, give it three redundant signals, not one.** Gradient direction matching your hero surface's light source, extra width vs. its siblings, and a visibly harder shadow. One signal alone reads as arbitrary; three together read as intentional.
4. **Never fill a static surface with pure white or pure black.** Start from `#E1E1E1`-ish for light surfaces and `#0A0A0A`-ish for dark ones, and let true white/black stay reserved for text and gradient extremes.
5. **If two elements need to feel layered, overlap them once** — don't reach for a drop shadow as the default depth tool. Straddling a boundary (like the avatar row) reads as more sophisticated and costs less visual noise than stacking shadows.
6. **Before shipping, run the two checks I flagged in §5 on your new component too:** does any text sit on the *lightest* part of a gradient (contrast risk), and does any tappable element have less than a clearly perceptible fill-contrast against its parent (affordance risk)? Both are easy to miss and both are visible in the original artifact this system came from.
