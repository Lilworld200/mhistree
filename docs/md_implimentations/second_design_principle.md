# Soft-Float UI Design Philosophy
## Reverse-Engineered Design System from the Reference Image

> **Purpose:** This document extracts the *design language* of the reference UI rather than recreating the finance card itself.  
> The goal is to give a developer, designer, or AI agent a reusable visual grammar that can be applied to dashboards, health interfaces, profile modules, analytics cards, onboarding panels, controls, lists, and other UI components.
>
> **Important:** Measurements, colors, radii, and shadows below are **visual estimates inferred from the supplied image**, not original source-design specifications. Treat them as starting tokens, then tune them against your product's typography, platform, and accessibility requirements.

---

# 1. Core Design Philosophy

The reference follows a **soft-float / tactile interface** philosophy:

- A large, quiet surface acts as the visual stage.
- A rounded container floats above that stage rather than feeling boxed into it.
- Important information sits inside a **large color-field hero**.
- Controls are mostly **pill or capsule shaped**.
- Secondary controls feel soft, pale, and slightly inset/frosted.
- The primary action is deliberately darker and visually heavier.
- Small circular avatars/icons create a playful human layer that overlaps structural boundaries.
- Borders are subtle, usually brighter than the surface underneath.
- Shadows are broad and diffused rather than hard or dramatic.
- Visual hierarchy comes from **surface contrast + scale + weight**, not from many colors.
- The interface uses a restrained color system and lets one saturated gradient region carry most of the visual energy.

The key idea is:

> **Make the interface feel like a collection of physical, softly manufactured objects floating on one continuous surface.**

This is different from traditional flat UI, where components are separated mostly by lines and boxes.

---

# 2. The Visual Grammar

The system can be understood as five stacked layers:

```text
LAYER 0 — Ambient Stage
    Quiet light-gray background
    Large empty breathing room
    Very soft ambient shadowing

LAYER 1 — Floating Shell
    Large rounded container
    Milky / light neutral surface
    Hairline bright border
    Broad soft drop shadow

LAYER 2 — Hero Surface
    Saturated blue gradient
    Very large corner radius
    Strong primary content contrast
    Minimal internal decoration

LAYER 3 — Floating / Embedded Modules
    Avatars
    Transaction / information cards
    Small labels
    Icon controls

LAYER 4 — Action Hierarchy
    Pale secondary controls
    Neutral text action
    Dark high-contrast primary CTA
```

Use the layers consistently across a product. A health dashboard, for example, could use the same architecture with:

- a blue hero panel for daily health status,
- circular care-team avatars,
- a recent-vitals panel,
- soft utility controls,
- a dark "Start check-in" CTA.

The **subject matter changes; the visual grammar does not.**

---

# 3. Component 01 — Ambient Background / Stage

## Role

The background is not a decorative element. It is the **lighting environment** for the entire interface.

The large empty light-gray area makes the central UI feel elevated.

## Philosophy

Do not make the page background compete with the interface.

The stage should feel:

- quiet,
- warm/cool-neutral,
- spacious,
- slightly dimensional,
- nearly invisible until the floating object is placed on it.

## Suggested Tokens

```css
--stage-bg: #F3F3F2;
--stage-highlight: rgba(255,255,255,0.70);
--stage-shadow: rgba(0,0,0,0.08);
```

Avoid pure white as the only background color. The reference relies on a very subtle gray so the white borders and internal surfaces remain visible.

## Surface Treatment

Use a gentle radial or linear lighting variation rather than a loud gradient.

Example concept:

```css
background:
  radial-gradient(
    circle at 50% 35%,
    rgba(255,255,255,.55),
    transparent 55%
  ),
  #F3F3F2;
```

The variation should be almost imperceptible.

## Design Rule

**The background provides atmosphere, not information.**

---

# 4. Component 02 — Floating Shell / Master Container

## Role

This is the main physical object containing all other components.

It should feel like one cohesive object rather than a stack of unrelated cards.

## Philosophy

Use one dominant shell instead of putting every subsection inside its own box.

The shell has:

- large radius,
- pale neutral fill,
- bright edge,
- soft ambient shadow,
- strong internal spacing.

## Estimated Geometry

```text
Radius:            28–38 px
Border:            1–2 px translucent white
Internal padding:  16–24 px
Shadow spread:     broad
```

For smaller interfaces:

```text
radius = clamp(24px, 5vw, 36px)
```

## Surface

Suggested starting point:

```css
background: #EDEDEC;
border: 1px solid rgba(255,255,255,.85);
```

A subtle vertical tonal shift can increase depth:

```css
background:
  linear-gradient(
    180deg,
    #F1F1F0 0%,
    #E9E9E8 100%
  );
```

## Shadow

Do not use a small, dark Material-style shadow.

Prefer something like:

```css
box-shadow:
  0 22px 45px rgba(0,0,0,.11),
  0 6px 14px rgba(0,0,0,.06);
```

The shadow should describe **weight**, not create a visible black halo.

---

# 5. Component 03 — Hero / Top Gradient Surface

## Role

The hero panel is the emotional center of the composition.

It communicates:

- importance,
- status,
- category,
- current state,
- primary metric.

## Philosophy

The hero should be visually strong but structurally simple.

Use:

- one large color field,
- one main metric,
- one small contextual label,
- minimal utility controls.

Do not fill the hero with multiple cards.

## Gradient Philosophy

The blue region is approximately:

```text
Top-left / upper region:
    vivid medium blue

Lower region:
    slightly deeper blue

Optional:
    faint luminous highlight
```

Suggested starting tokens:

```css
--hero-blue-1: #5C9BFF;
--hero-blue-2: #347CE8;
```

Example:

```css
background:
  linear-gradient(
    145deg,
    #68A4FF 0%,
    #478BEE 48%,
    #2F74D8 100%
  );
```

The gradient angle should generally be diagonal rather than perfectly vertical.

## Radius

The radius is intentionally large:

```css
border-radius: 28px 28px 42px 42px;
```

The lower corners can feel slightly more pronounced if the composition benefits from it.

## Internal Layout

Think in terms of vertical hierarchy:

```text
[utility / identity row]

        [micro label]

      [large metric]

        [breathing space]
```

The main number should visually dominate the region.

## Design Rule

**Saturated color belongs to the information layer, not the entire application.**

This allows an otherwise neutral UI to feel premium without becoming visually noisy.

---

# 6. Component 04 — Micro-Label Pill

## Role

The small capsule above the primary value provides context without taking attention away from the metric.

Examples outside finance:

- "Today's status"
- "Current score"
- "Care plan"
- "Sleep quality"
- "Last updated"

## Philosophy

It behaves like a **floating caption**, not a conventional button.

## Suggested Geometry

```css
padding: 6px 12px;
border-radius: 999px;
font-size: 12–14px;
font-weight: 500;
```

On a saturated hero surface, use a translucent light treatment:

```css
background: rgba(255,255,255,.12);
border: 1px solid rgba(255,255,255,.20);
color: rgba(255,255,255,.92);
backdrop-filter: blur(10px);
```

## Design Principle

The label should look like it is **printed on a translucent layer floating above the gradient**, not like a separate rectangular badge.

---

# 7. Component 05 — Primary Metric / Display Typography

## Role

This is the strongest text element in the hierarchy.

## Philosophy

Use size and whitespace, not color changes, to create authority.

The reference style favors:

- large display size,
- medium-to-semibold weight,
- tight line-height,
- high contrast,
- generous surrounding space.

## Suggested Token

```css
font-size: clamp(34px, 6vw, 54px);
font-weight: 600;
letter-spacing: -0.04em;
line-height: .95;
```

Depending on the product, the typeface can be:

- modern grotesk,
- geometric sans,
- neo-humanist sans,
- clean system sans.

Avoid overly decorative fonts.

## Formatting Rule

For numerical metrics:

```text
$152,092.23

```

is visually stronger than:

```text
Balance: $152,092.23
```

because the context belongs above the metric while the value remains visually clean.

For a health product:

```text
82

Recovery score
```

or:

```text
7h 42m

Sleep
```

can use the same hierarchy.

---

# 8. Component 06 — Identity / Utility Row

## Role

This row establishes ownership and exposes low-priority utilities.

Typical contents:

- small avatar,
- name,
- notification icon,
- settings,
- connection indicator.

## Philosophy

Keep this layer **small and quiet**.

The row should never compete with the main metric.

## Layout

```text
[small identity] ---------------- [small utility]
```

Suggested spacing:

```css
padding-inline: 8px;
gap: 8–12px;
```

## Icon Scale

```text
Utility icon: 16–20 px
Identity avatar: 20–28 px
```

Keep line weights visually consistent across icons.

---

# 9. Component 07 — Overlapping Circular Avatar Rail

## Role

The avatars introduce human identity, ownership, collaboration, or context.

The reference uses circles that intentionally overlap the transition between the hero and lower shell.

## Philosophy

**Overlap creates depth without requiring more cards.**

This is one of the most reusable ideas in the entire design.

Use an overlapping rail for:

- care teams,
- family members,
- assigned doctors,
- project collaborators,
- social participants,
- connected devices.

## Geometry

```css
.avatar {
  width: 44–58px;
  height: 44–58px;
  border-radius: 50%;
}
```

The avatar has:

```text
colored outer ring
light highlight border
subtle shadow
```

Suggested spacing:

```css
margin-left: -8px;
```

or more generally:

```text
overlap = 12–18% of avatar diameter
```

## Depth Treatment

```css
border: 3px solid rgba(255,255,255,.78);
box-shadow:
  0 5px 12px rgba(0,0,0,.10);
```

## Design Rule

Do not overdecorate each avatar. Their collective rhythm matters more than individual complexity.

---

# 10. Component 08 — Information / Transaction Card

## Role

This lower panel contains a compact piece of structured information.

The reference uses one recent item rather than a dense table.

## Philosophy

Make information feel like a **quiet object embedded into the shell**, not another loud card.

## Suggested Surface

```css
background: rgba(255,255,255,.20);
border: 1px solid rgba(255,255,255,.55);
border-radius: 20–26px;
```

A more opaque version may be preferable when accessibility or text clarity is critical:

```css
background: #F2F2F1;
```

## Internal Structure

```text
small section label ---------------- auxiliary action

[ circular icon ] [ title
                    metadata ]                  [amount]
```

Use three hierarchy levels:

1. micro label,
2. main item title/value,
3. muted metadata.

## Spacing

```text
Card padding: 14–18 px
Icon-to-text gap: 12–14 px
Title-to-metadata gap: 2–5 px
```

## Design Rule

The content card should remain readable even if the surrounding shell is removed.

---

# 11. Component 09 — Circular Icon Button

## Role

Small utility actions such as:

- settings,
- filter,
- edit,
- microphone,
- scan,
- preferences.

## Philosophy

The reference intentionally makes small controls feel like **physical soft objects**.

## Suggested Geometry

```css
width: 52–58px;
height: 52–58px;
border-radius: 50%;
```

## Surface

```css
background: rgba(255,255,255,.42);
border: 1px solid rgba(255,255,255,.62);
```

## Shadow

```css
box-shadow:
  0 5px 12px rgba(0,0,0,.06),
  inset 0 1px 1px rgba(255,255,255,.55);
```

The inset highlight is important because it makes the button look slightly molded.

---

# 12. Component 10 — Soft Secondary Capsule Button

## Role

Used for actions that matter but are not the dominant CTA.

Examples:

- Receive,
- View details,
- Add,
- Continue,
- Open,
- Review.

## Philosophy

The button should feel almost like a **soft piece of material resting on the shell**.

It should be visibly interactive but visually quiet.

## Geometry

```css
height: 52–58px;
padding-inline: 22–28px;
border-radius: 999px;
```

## Surface

Starting token:

```css
background: #F4F4F3;
```

More tactile version:

```css
background:
  linear-gradient(
    180deg,
    #F8F8F7 0%,
    #EDEDED 100%
  );
```

## Border + Shadow

```css
border: 1px solid rgba(255,255,255,.78);

box-shadow:
  0 5px 12px rgba(0,0,0,.05),
  inset 0 1px 2px rgba(255,255,255,.75);
```

## Interaction

Pressed state:

```css
transform: translateY(1px);
box-shadow:
  inset 0 2px 5px rgba(0,0,0,.08);
```

Hover:

```css
filter: brightness(1.01);
```

Keep interaction changes subtle.

---

# 13. Component 11 — Primary Black CTA Capsule

## Role

This is the highest-priority interaction.

The reference uses a black / near-black capsule against a pale shell.

## Philosophy

The primary CTA is not made primary because it is colorful.

It is primary because it has the **highest visual weight**.

That is an important design principle.

## Geometry

```css
height: 54–60px;
padding-inline: 24–30px;
border-radius: 999px;
```

## Color

Avoid pure black in most contexts.

Use:

```css
--cta-black: #111111;
```

or:

```css
#171717
```

## Shadow

```css
box-shadow:
  0 7px 15px rgba(0,0,0,.18);
```

Optional subtle top highlight:

```css
background:
  linear-gradient(
    180deg,
    #242424 0%,
    #0D0D0D 100%
  );
```

## Typography

```css
color: #FFFFFF;
font-weight: 500–600;
```

The text should remain visually calm. Let the surface provide the authority.

## Design Rule

Use **one dominant dark action per action group**.

If every button is black, none of them is primary anymore.

---

# 14. Component 12 — Capsule / Pill Geometry System

Pills are not just a shape choice. They are a behavioral language.

## Meaning

The system can use:

```text
Circle
    = utility / identity

Pill
    = action / choice

Large rounded rectangle
    = content container

Huge rounded rectangle
    = primary surface / state

Text
    = passive information
```

This gives the UI a semantic visual grammar.

## Universal Rule

For interactive elements:

```css
border-radius: 999px;
```

For containers:

```css
border-radius: 20–40px;
```

Do not randomly mix many corner radii.

---

# 15. Component 13 — Soft Border System

Borders are very subtle in the reference.

## Philosophy

Use borders primarily to catch light and separate neighboring surfaces.

Avoid dark borders.

## Suggested Tokens

```css
--border-light: rgba(255,255,255,.80);
--border-soft: rgba(255,255,255,.50);
--border-dark: rgba(0,0,0,.06);
```

## Priority

```text
White/translucent border
        ↓
surface contrast
        ↓
shadow
        ↓
dark border only if absolutely required
```

The UI should not look like every component has been outlined with a marker.

---

# 16. Component 14 — Shadow Architecture

The reference's shadows are a major part of the visual identity.

The goal is **soft depth**, not dramatic floating cards.

## Three Shadow Levels

### Level 1 — Micro

For icons and small buttons:

```css
0 3px 8px rgba(0,0,0,.05)
```

### Level 2 — Component

For cards / capsules:

```css
0 6px 14px rgba(0,0,0,.06)
```

### Level 3 — Shell

For the entire main object:

```css
0 20px 45px rgba(0,0,0,.10)
```

## Key Principle

Large surfaces need **large blur values**.

Small components need **small blur values**.

Never use the same shadow for every component.

---

# 17. Component 15 — Highlight / Inset Lighting

The reference uses a very subtle "light from above" treatment.

This can be represented with an inset highlight:

```css
box-shadow:
  inset 0 1px 1px rgba(255,255,255,.65);
```

This is especially effective on:

- buttons,
- pills,
- pale cards,
- shell edges.

It gives a soft manufactured feel.

Do not make the highlight strong enough to look glossy.

---

# 18. Component 16 — Spacing Architecture

The design feels premium partly because it has room to breathe.

Use a small spacing scale.

Recommended baseline:

```text
4
8
12
16
20
24
32
40
48
```

## Recommended Meaning

```text
4–8 px   = micro relationships
12 px    = icon/text relationship
16 px    = local padding
20–24 px = component padding
32 px    = major section separation
40–48 px = shell-level breathing room
```

Avoid arbitrary values throughout the system.

---

# 19. Component 17 — Layout Architecture

A useful reusable model is:

```text
Page
└── Stage
    └── Floating Shell
        ├── Hero
        │   ├── Identity Row
        │   ├── Context Pill
        │   └── Primary Metric
        │
        ├── Overlap Layer
        │   └── Avatar Rail
        │
        ├── Information Module
        │   ├── Section Label
        │   ├── Content Row
        │   └── Secondary Metadata
        │
        └── Action Row
            ├── Utility Icon
            ├── Utility Icon
            ├── Secondary CTA
            └── Primary CTA
```

This is the structural pattern to reuse.

---

# 20. Component 18 — Contrast Hierarchy

The design is intentionally restrained.

Use roughly this hierarchy:

```text
Highest visual weight
    ↓
Primary black CTA
Primary metric
Saturated hero
    ↓
Secondary action
Main item title
    ↓
Utility icon
Metadata
Micro labels
    ↓
Background
```

Do not allow tiny labels to become more visually intense than primary content.

---

# 21. Component 19 — Color Architecture

A robust implementation can start with:

```css
:root {
  /* neutrals */
  --bg: #F3F3F2;
  --surface: #ECECEB;
  --surface-soft: #F4F4F3;

  /* text */
  --text-primary: #181818;
  --text-secondary: #6E6E6E;
  --text-muted: #9A9A9A;

  /* hero */
  --hero-1: #69A5FF;
  --hero-2: #347BDD;

  /* action */
  --cta-primary: #111111;

  /* borders */
  --border-light: rgba(255,255,255,.80);
  --border-soft: rgba(255,255,255,.55);

  /* effects */
  --shadow-soft: rgba(0,0,0,.07);
  --shadow-strong: rgba(0,0,0,.14);
}
```

The exact hue can change according to the product identity.

The *relationship* should remain:

```text
neutral stage
→ neutral shell
→ one saturated hero
→ mostly neutral controls
→ one dark primary action
```

---

# 22. Component 20 — Typography System

Use a restrained type system.

## Suggested Levels

```text
Display:
40–56 px / 600

Section title:
16–20 px / 600

Body:
14–16 px / 450–500

Metadata:
11–13 px / 400

Micro label:
11–12 px / 500
```

## Letter Spacing

Display values:

```css
letter-spacing: -0.03em;
```

Body:

```css
letter-spacing: -0.01em;
```

Micro labels:

```css
letter-spacing: 0;
```

Avoid excessive tracking on modern sans-serif text.

---

# 23. Design Philosophy for Iconography

Icons should feel like part of the same physical system.

Use:

- rounded icon geometry,
- moderate line weight,
- simple silhouettes,
- no overly sharp detail.

The icon should not become the visual subject.

Preferred relationship:

```text
surface > text > icon
```

for information interfaces.

For utility-only controls:

```text
surface ≈ icon
```

---

# 24. Interaction Philosophy

The reference style suggests **soft physicality**, so interaction should also be soft.

## Hover

Increase brightness slightly or raise the object by 1 px.

## Press

```css
transform: translateY(1px) scale(.99);
```

and reduce the outer shadow slightly.

## Focus

Do not rely on shadow alone for keyboard accessibility.

Add a clear focus ring:

```css
outline: 2px solid currentColor;
outline-offset: 3px;
```

The visual language should remain soft while the focus indicator remains unmistakable.

---

# 25. Responsive Design Philosophy

Do not simply shrink the reference composition.

Preserve relationships instead:

### Desktop

```text
larger shell
more breathing room
larger hero
wider action row
```

### Mobile

```text
same shell language
same radius philosophy
same hero hierarchy
reduced horizontal padding
buttons may become equal-width
avatar overlap remains
```

The identity should survive size changes.

---

# 26. Reusable Composition Recipes

## Recipe A — Dashboard Status

```text
Large Shell
  → Saturated Status Hero
      → Identity
      → Context Pill
      → Large Value
  → Overlapping User/Team Rail
  → Recent Insight Card
  → Soft Utility Buttons
  → Dark Primary CTA
```

## Recipe B — Health Summary

```text
Large Shell
  → Blue/green gradient health state
      → "Today's health"
      → 82
      → "Good"
  → Care-team avatar rail
  → Recent measurement card
  → [Add record] [Review plan]
```

## Recipe C — AI Assistant

```text
Large Shell
  → Gradient conversation status
      → "Assistant ready"
      → large current state
  → participant / source avatars
  → most recent suggestion
  → utility icon row
  → dark "Start session" CTA
```

## Recipe D — Profile / Account

```text
Large Shell
  → gradient identity surface
  → profile context
  → key account metric
  → overlapping connections
  → recent activity
  → soft actions
  → one dark primary CTA
```

---

# 27. AI-Agent Design Instructions

An AI design agent can be given the following rules:

```text
1. Build one large rounded parent surface first.
2. Use a quiet neutral page background.
3. Create one visually dominant saturated hero region.
4. Keep the hero structurally simple.
5. Place the main metric at the center of hierarchy.
6. Use a small translucent capsule for contextual labeling.
7. Use circular identities to create depth through overlap.
8. Use pale rounded surfaces for secondary modules.
9. Use pill-shaped controls for actions.
10. Make one primary action dark and visually heavy.
11. Use broad, low-opacity shadows rather than hard shadows.
12. Use bright translucent borders to catch simulated light.
13. Keep the palette restrained.
14. Preserve generous whitespace.
15. Use no more than one dominant saturated region per major object.
16. Treat circles as identity/utility and pills as actions.
17. Keep typography modern, compact, and hierarchy-driven.
18. Do not surround every object with a hard border.
19. Prefer surface contrast over outline contrast.
20. Preserve the same visual grammar even when the domain changes.
```

---

# 28. Component Token Table

| Token | Suggested Starting Value | Purpose |
|---|---:|---|
| `radius-shell` | 32px | Main floating object |
| `radius-hero` | 28–40px | Hero surface |
| `radius-card` | 20–26px | Information modules |
| `radius-pill` | 999px | Actions and labels |
| `radius-circle` | 50% | Avatars and utility controls |
| `space-xs` | 4px | Micro spacing |
| `space-sm` | 8px | Small spacing |
| `space-md` | 16px | Standard spacing |
| `space-lg` | 24px | Component padding |
| `space-xl` | 32px | Major section gap |
| `shadow-sm` | `0 4px 10px rgba(0,0,0,.05)` | Small controls |
| `shadow-md` | `0 8px 18px rgba(0,0,0,.07)` | Cards |
| `shadow-lg` | `0 22px 45px rgba(0,0,0,.10)` | Main shell |
| `border-light` | `rgba(255,255,255,.80)` | Edge highlight |
| `text-primary` | `#181818` | Main text |
| `text-secondary` | `#6E6E6E` | Supporting text |
| `stage-bg` | `#F3F3F2` | Page surface |
| `surface` | `#ECECEB` | Main shell |
| `hero-start` | `#69A5FF` | Gradient start |
| `hero-end` | `#347BDD` | Gradient end |
| `cta-primary` | `#111111` | Primary action |

---

# 29. Construction Order for Developers

When implementing a new component in this design language, build it in this order:

```text
01. Establish the page/stage
02. Establish the floating shell
03. Define the hero surface
04. Define typography hierarchy
05. Add overlap components
06. Add information modules
07. Add secondary actions
08. Add the primary CTA
09. Add borders
10. Add shadows
11. Add micro-highlights
12. Tune spacing
13. Tune responsive behavior
14. Validate contrast and accessibility
```

This order matters because the design's hierarchy comes from **relationships between surfaces**, not isolated styling.

---

# 30. What NOT to Do

Avoid these patterns:

```text
X Hard black borders everywhere
X Strong Material-style card shadows
X Too many independent cards
X Many saturated colors competing
X Tiny corner radii
X Every control using a different radius
X Large text inside every component
X Excessive gradients
X Strong glass blur everywhere
X Random spacing values
X Making every CTA black
X Treating the hero as a normal card
```

The system works because it is disciplined.

---

# 31. The Core Design Equation

The visual language can be summarized as:

```text
Premium Soft UI
=
Quiet Neutral Stage
+
Floating Rounded Shell
+
One Saturated Hero
+
Large Metric
+
Overlapping Human Layer
+
Soft Secondary Controls
+
One Dark Primary CTA
+
Diffuse Shadows
+
Bright Hairline Borders
+
Generous Whitespace
```

Or, more conceptually:

```text
LOW VISUAL NOISE
        +
TACTILE SURFACES
        +
STRONG HIERARCHY
        +
CONTROLLED COLOR
        =
SOFT-FLOAT UI
```

---

# 32. Final Design Principle

The most important thing to copy from the reference is **not the blue card, the financial content, the exact numbers, the avatars, or the button labels**.

Copy the underlying relationship:

> **A calm environment contains a single floating object. The object contains one dominant visual state. Human/contextual elements overlap structural boundaries. Secondary controls remain soft. One action is deliberately heavy. Depth comes from subtle lighting, surface contrast, and spacing rather than visual clutter.**

That is the reusable design philosophy.

A completely different product can therefore use the same system:

```text
Finance
→ balance

Health
→ health score

AI
→ assistant state

Productivity
→ focus score

Fitness
→ recovery score

Travel
→ trip status

Education
→ learning progress
```

The content changes.

The **visual architecture remains stable**.
