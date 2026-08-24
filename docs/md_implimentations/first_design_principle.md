# TACTILE GLASSMORPHISM & VOLUMETRIC 2.5D DESIGN SYSTEM SPECIFICATION

This document outlines the design philosophy, light physics, geometry, and design tokens for the **Tactile Glassmorphism / Volumetric 2.5D** UI design system. It is structured into modular atomic components so developers and AI agents can replicate this aesthetic across any arbitrary UI element (e.g., forms, media players, navigation bars, control panels).

---

## System Core Principles & Light Physics

1. **Global Lighting Model:** A singular key light source originates from **12 o'clock directly above the screen**, angled slightly forward toward the user. All specular highlights occur on top edges; all ambient shadows project vertically downward along the positive Y-axis.
2. **Material Transparency:** Interfaces are built from semi-translucent, acrylic-like planes rather than solid opaque surfaces.
3. **Rim Lighting (Edge Refraction):** Every translucent layer uses a 1px white border with varying opacities (`0.30` to `0.80`) to simulate physical light refracting through cut glass edges.
4. **Squircle Curvature:** Sharp box corners are strictly prohibited. Interfaces utilize continuous super-ellipse curves (squircles) to reinforce a molded, ergonomic feel.

---

## Component Architectural Specifications

### Component A: Translucent Chassis Container (Base Hull)

```
┌─────────────────────────────────────────┐
│ 1px Light-Refracting Rim Stroke         │
│ ┌─────────────────────────────────────┐ │
│ │ Semi-Opaque Frosted Surface         │ │
│ │ (backdrop-filter: blur)             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
  └── Ambient Diffuse Shadow (Y-Axis Offset)

```

- **Design Philosophy:** Acts as the primary structural chassis holding child controls. It provides visual isolation from the background canvas while maintaining spatial context through high-density blur.

- **Geometry:** Large continuous squircle (`border-radius: 36px` / `2.25rem`).
- **Color & Material:**
- Background: Semi-transparent neutral tint (`rgba(235, 238, 243, 0.72)`).

- Backdrop Filter: High saturation, heavy blur (`backdrop-filter: blur(24px) saturate(180%)`).

- **Border & Rim Lighting:**
- Stroke: `1px solid rgba(255, 255, 255, 0.65)`.

- **Elevation Matrix:**
- Primary Shadow: `0px 32px 64px -12px rgba(0, 0, 0, 0.12)`.

- Soft Ambient: `0px 8px 16px -4px rgba(0, 0, 0, 0.04)`.

---

### Component B: Volumetric Gloss Surface (Hero Segment)

```
┌─────────────────────────────────────────┐  ← Top Specular Glare Overlay
│░░░░░░░░░░ White-to-Transparent ░░░░░░░░░│  (Simulates convex glossy curve)
├─────────────────────────────────────────┤
│                                         │
│ Vibrant Multi-Stop Primary Gradient     │  ← High-Saturation Core Color
│                                         │
└─────────────────────────────────────────┘

```

- **Design Philosophy:** Commands primary visual hierarchy. It mimics a polished, convex plastic or acrylic dome sheet embedded within the chassis.

- **Geometry:** Top corners inherit chassis padding (`border-radius: 28px 28px 0px 0px`); bottom edge employs a continuous concave or rounded terminal.
- **Color & Material:**
- Core Surface: Vibrant 135° multi-stop linear gradient (`linear-gradient(135deg, #4F86FF 0%, #2563EB 50%, #1D4ED8 100%)`).

- **Specular Glare Physics:**
- Applied via a pseudo-element (`::before`) or layered radial gradient overlay across the top 40% height: `linear-gradient(180deg, rgba(255, 255, 255, 0.40) 0%, rgba(255, 255, 255, 0.00) 100%)`.

- **Elevation & Border:**
- Inset Top Glow: `inset 0px 1px 1px 0px rgba(255, 255, 255, 0.50)`.

---

### Component C: Primary Tactile Dome Button (Half-Pill 3D CTA)

```
        Top Specular Rim Highlight (inset light reflection)
         ┌──────────────────────────────────────────────┐
  ┌──────┴──────────────────────────────────────────────┴──────┐
  │ ░░░░░░░░░ Light-to-Dark Vertical Gradient ░░░░░░░░░░░░░░░ │  ← Convex Top Dome
  └──────┬──────────────────────────────────────────────┬──────┘
         └──────────────────────────────────────────────┘
        Heavy Directional Shadow (Gives physical height)

```

- **Design Philosophy:** **The Half-Pill Dome (Claymorphic 3D)**. Designed to look like a physical cylinder split horizontally in half. The flat back surface rests flush against the canvas, while the rounded convex front dome protrudes outward toward the user.

- **Geometry:** Full capsule / stadium geometry (`border-radius: 9999px`).
- **Color & Material:**
- Surface Fill: High-contrast dark vertical gradient (`linear-gradient(180deg, #2A2D32 0%, #111315 100%)`).

- **Lighting Physics:**
- Top Specular Rim: An inner highlight simulating overhead key light striking the apex curve of the dark plastic dome (`box-shadow: inset 0px 1px 1px 0px rgba(255, 255, 255, 0.35)`).

- **Elevation Matrix:**
- Multi-Stage Heavy Directional Shadow:
- Key Shadow: `0px 10px 20px -2px rgba(0, 0, 0, 0.35)`

- Diffuse Spread: `0px 4px 6px -1px rgba(0, 0, 0, 0.20)`

---

### Component D: Recessed Frosted Pill (Secondary Action Trigger)

- **Design Philosophy:** Provides functional control without competing against the primary 3D dome button. It acts as a semi-flat, frosted glass plate embedded into the surface.

- **Geometry:** Stadium pill geometry (`border-radius: 9999px`).
- **Color & Material:**
- Surface Fill: Neutral translucent glass (`rgba(255, 255, 255, 0.65)`).

- Backdrop Filter: `backdrop-filter: blur(12px)`.

- **Border & Elevation:**
- Rim Stroke: `1px solid rgba(255, 255, 255, 0.80)`.

- Shadow: Minimal surface shadow (`0px 2px 4px rgba(0, 0, 0, 0.03)`).

---

### Component E: Monolithic Circular Utility Triggers

- **Design Philosophy:** Compact, non-textual icon triggers. Built as 1:1 circular tactile buttons that sit flush within control groups.

- **Geometry:** Strict 1:1 aspect ratio circle (`aspect-ratio: 1 / 1`, `border-radius: 50%`).
- **Color & Material:**
- Surface Fill: `rgba(255, 255, 255, 0.55)`.

- Rim Stroke: `1px solid rgba(255, 255, 255, 0.70)`.

- **Elevation Matrix:**
- Soft Ambient Shadow: `0px 2px 6px rgba(0, 0, 0, 0.04)`.

---

### Component F: Floating Inter-Layer Seam Badges

```
  Upper Volumetric Layer
─────────────────────────  ← Layer Boundary Line
  Lower Chassis Layer
      ◯   ◯   ◯            ← Badges overlapping the seam on Z-Axis

```

- **Design Philosophy:** Elements positioned directly on the seam between two contrasting material layers. They break grid monotony and establish a clear multi-level spatial Z-index.

- **Geometry:** Perfect circles (`border-radius: 50%`) with negative horizontal margin overlap (`margin-left: -8px`).

- **Border & Isolation:**
- Outer Isolation Mask: Heavy white ring (`border: 3px solid rgba(255, 255, 255, 0.90)`) to cleanly cut through background transitions.

- **Elevation Matrix:**
- Floating Shadow: `0px 4px 8px rgba(0, 0, 0, 0.12)`.

---

## Standardized Design Token Matrix (CSS Variables)

```css
:root {
  /* Surface Color Tokens */
  --chassis-bg: rgba(235, 238, 243, 0.72);
  --hero-surface-gradient: linear-gradient(
    135deg,
    #4f86ff 0%,
    #2563eb 50%,
    #1d4ed8 100%
  );
  --secondary-pill-bg: rgba(255, 255, 255, 0.65);
  --utility-btn-bg: rgba(255, 255, 255, 0.55);
  --dome-primary-bg: linear-gradient(180deg, #2a2d32 0%, #111315 100%);

  /* Lighting & Specular Glare Overlays */
  --specular-glare-overlay: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(255, 255, 255, 0) 100%
  );
  --dome-top-rim-inset: inset 0px 1px 1px 0px rgba(255, 255, 255, 0.35);

  /* Rim Lighting Stroke Tokens */
  --stroke-chassis-rim: 1px solid rgba(255, 255, 255, 0.65);
  --stroke-secondary-rim: 1px solid rgba(255, 255, 255, 0.8);
  --stroke-floating-ring: 3px solid rgba(255, 255, 255, 0.9);

  /* Radii Tokens */
  --radius-chassis: 36px;
  --radius-hero-card: 28px;
  --radius-subcard: 18px;
  --radius-stadium: 9999px;

  /* Elevation Matrix Tokens */
  --shadow-chassis: 0px 32px 64px -12px rgba(0, 0, 0, 0.12);
  --shadow-dome-cta:
    0px 10px 20px -2px rgba(0, 0, 0, 0.35), 0px 4px 6px -1px rgba(0, 0, 0, 0.2);
  --shadow-seam-badge: 0px 4px 8px rgba(0, 0, 0, 0.12);
  --shadow-utility-btn: 0px 2px 6px rgba(0, 0, 0, 0.04);

  /* Blur Tokens */
  --blur-chassis: blur(24px) saturate(180%);
  --blur-pill: blur(12px);
}
```
