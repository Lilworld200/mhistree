Owner update, 2026-10-16: `71121bd` is the selected reference for restoring existing page UI. Read [snapshot-71121bd.md](snapshot-71121bd.md) alongside this earlier measured guide. Current product/auth/access contracts remain authoritative for behavior.

# Preserved interface guide — T03

Owner spacing override2026-10-20: current account-card CSS uses32px equal padding rather than the earlier40px vertical/32px horizontal recipe. Final navigation removes its additional bottom margin; Other options uses4px grid gaps between divider and actions after feedback that12px was excessive. These are implemented CSS values, not newly measured screenshots.

Owner override2026-10-20: patient /auth sign-in/sign-up now place title and health-story subtitle left, logo top right. Scoped account-auth-header flex CSS replaces the earlier centered header only for those modes. Professional/setup/code header layouts remain as before; original measurements below describe the earlier reference, not measured geometry of this update.

2026-10-09, original application at commit `2c8c46c`. Read before every UI task. Visual authority is the inspected application, not the PDF. All dimensions below are CSS pixels at normal zoom. References contain guest/synthetic UI only. No authenticated patient content was captured.

## Verified foundation

`app/layout.tsx` loads Manrope through next/font/google, Latin subset, swap display, `--font-manrope`. Computed font is Manrope with generated fallback and system-ui/sans-serif; body 16px/24px, letter spacing -0.01em. Do not substitute the README's Geist description. Exact font file/license must be packaged and checked for portable offline reconstruction; build-managed font output is not an original asset manifest.

Light tokens in `app/globals.css`, corroborated by rendered chat:

| Meaning/token | Value |
| --- | --- |
| stage / shell / shell2 / card | #f3f3f2 / #ececeb / #f1f1f0 / #f6f6f5 |
| ink / ink2 / ink3 | #181818 / #6e6e6e / #9a9a9a |
| hero1 / hero2 | #69a5ff / #347bdd |
| green / amber / red | #2f8f5b / #c08a2d / #cc5348 |
| border light / subtle | white at .8 / .55 alpha |
| sh1 / sh2 / sh3 | 0 3px 8px black .05 / 0 6px 14px black .06 / 0 22px 45px black .1 |
| Primary button | gradient #242424 to #0d0d0d, white text, white .14 border; 0 7px 15px black .22 and inset 0 1px 1px white .28 |

Dark tokens exist in source but were **not rendered/contrast-verified**: stage #0e0e10; shell #191a1c; shell2 #1f2023; card #28292c; ink #f4f4f5; secondary #a8a8ad; tertiary #77777c. Preserve source as reference; do not claim dark-theme acceptance. Theme preference was not changed during audit.

## Reconstructing the representative chat page

At 1440×1000: stage padding 20, columns 288 and remaining width, gap 20. Sidebar begins (20,20), size 288×960, radius 28, padding 18px 12px. Main shell begins (328,20), 1092×960, radius 32. Navigation rows are 44 high, pill radius 999, horizontal padding 14, gap 11; labels 13.5px weight 700. Use the original black/white Mhistree logo variants, not text approximations when assets exist.

The main chat has a top context/header strip, flexible central empty-state hero, wrapping suggested-action pills, and bottom composer. It is a flex column; do not position the hero with fixed screen coordinates. Empty heading and helper text must match the saved reference. Composer desktop padding 16px 22px, gap 10; rounded input padding 13px 20px, weight 600, measured 14px/21px. Its 1440 reference rectangle is approximately (458.8,913.9,878.4,48.6). Preserve overall density but repair mobile input to at least 16px during implementation, documenting the intentional small difference.

At width ≤980: sidebar hides; mobile topbar appears and layout becomes one column with 12px padding/gap. At 390×844 the topbar is approximately (12,12,366.4,58.8), radius 20, sticky top 12. Composer padding becomes 12; general scrolling content 20px 16px 96px. Main shell minimum height follows viewport minus 96. Empty action pills wrap; no horizontal document overflow was observed at 390. The source includes additional 900/1200 layout breakpoints; provider grids collapse by 1200 and three-column patient grids activate from 1200.

The page transition uses opacity and vertical movement (entry 14px, exit -10px), duration .26s, cubic-bezier(.22,1,.36,1). Dialog scrim opacity lasts .18s; centered spring damping26/stiffness320; side damping30/stiffness300. These are source-observed values, not measured frame timing. Reduced-motion behavior remains to be repaired/verified.

## Reconstructing the representative button

Use `Btn` in `components/ui/button.tsx` with `kind="soft"` or `kind="dark"`, optional `sm`, icon, and `asChild` for links. CSS: inline flex, center alignment, 8px gap, pill radius999, 1px border, 13.5px/weight800. Regular buttons height50; dark padding0 22, soft0 20. Soft background is card-to-shell gradient with sh1 plus white inset highlight. Active translates1px/scales.99. Focus is 2px currentColor outline offset3. Disabled opacity .55. IconBtn defaults46 square/circle with icon round(size*.42); caller can override. A missing title needs an explicit accessible name. Do not reuse the visual button as permission enforcement.

Example: `<Btn kind="dark" icon="plus">New chat</Btn>` (confirm icon name against icons.tsx when coding). See catalog for dialog and source/status semantics.

## References and observed interactions

| Artifact under reference/ | Viewport/state |
| --- | --- |
| chat-desktop-light.jpg | 1440×1000, guest empty chat |
| chat-mobile-light.jpg | 390×844, same state |
| chat-laptop-light.jpg | 1366×768, empty chat |
| chat-ultrawide-light.jpg | 2560×1440, empty chat |
| navigation-mobile-focus.jpg | 390×844, open navigation, Close menu focused |
| auth-desktop-light.jpg | 1440×1000, empty sign-in |
| auth-required-field.jpg | 1440×1000, native required-field validation |
| auth-mobile-light.jpg | 390×844, sign-in with first field focused |
| chat-mobile-measurements.json | DOM geometry/styles captured before interruption |

Opening mobile navigation moves focus to Close menu. Escape dismisses after the exit animation; immediate snapshots still show the exiting dialog. Settled observation found no dialog but no named focused trigger: return-focus repair/verification remains outstanding. Empty sign-in submission shows “Please fill out this field” and focuses the first input; no credentials entered and no signup performed.

Authenticated clinician content was blocked by its sign-in modal. Provider layout source was inspected, but dense/provider flows, patient error states, loading states, full keyboard traversal, reduced motion, contrast, Safari, throttled performance, safe areas and zoom behavior are unverified. These uncertainties remain explicit and must be verified when the corresponding implementation exists with synthetic accounts.

### Independent reproduction evidence

`auth-specimen.html` independently reconstructs the existing sign-in page and primary button using measured styles and original assets, without React, application CSS, auth handlers, backend calls or patient data. It is a visual-only reference, not an implemented authentication flow or the future contactless design. `python docs/design/serve-specimen.py` serves only whitelisted HTML/logo/build-generated Latin font at localhost3102; requires an existing legacy build. It cannot accept POST or list repository files. Do not enter credentials. Font redistribution/license remains a portability dependency.

At 1440×1000, both original and specimen card: x500,y219.05,width440,height561.90; primary button: x532.8,y642.15,width374.4,height50. At390×844 both card: x16,y141.05,width358.4,height561.90; button: x48.8,y564.15,width292.8,height50. Both mobile document widths390, no horizontal overflow. Original/reconstruction mobile JSON measurements are saved in reference/. Main geometry difference is zero at captured precision. Side-by-side visual inspection confirms layout, type hierarchy, gradients, spacing and input focus. The original optimized logo/capture has different raster sharpness from the raw source asset; no pixel-identical claim is made.

Auth page recipe: viewport-centered container padding32px16px; card max-width440, padding40px32px, radius32, white→#fafafa, shadow0 24px48px black .4. Logo height54, gap16, helper14.4px/opacity.7; brand group bottom32. Two-column segmented control padding4/radius999, label13px/800, vertical padding11, bottom28. Form column gap14; field labels12.8px/600 bottom4; input follows composer token; primary margin-top8; footer margin-top24 and13.6px underlined text. These additions make this page reconstructable from the guide.

Additional references: auth-reconstruction-desktop.jpg (1440×1000), auth-reconstruction-error.jpg (same empty-submit validation), auth-reconstruction-mobile.jpg (390×844 focused input). Native required validation moves focus to Email Address in both; specimen adds explicit label association without changing geometry. Nonessential navigation and sign-up are visual-only. T03 representative page/component preservation gate is verified within this stated scope, not a certification of every product screen.

## Necessary repairs, without redesign

Record each change and compare same viewport/state: mobile input14→16; robust composer focus indicator; nav transition:all→explicit properties; reduced-motion variant; reliable focus return; mobile close target36→44 hit area; current-context titles/skip link; chart textual alternatives. Provenance badges must retain readable labels and reflect trusted source status, not model confidence. Do not preserve fabricated success text, seeded clinical claims, timed-lease semantics or AI-inferred diagnoses merely because they appear in an attractive component.

## Asset provenance

Original repo assets: `app/assets/images/logos/mhistree_black_logo.png` SHA256 E52CAE21E8BC1898F0B14063B1D79815FEFBD82F155A1C3D86B747DB6E538B53; `mhistree_white_logo.png` SHA256 9AF09F6CFA991AD7F8C339478B308FDCDD7CD1999C7870C69DAA0F233869EC3C. Ownership/license not independently documented; retain originals, resolve redistribution before handover. `components/ui/icons.tsx` is the code icon source; audit its provenance before distribution. Starter public SVGs are not Mhistree branding. External prototype imagery is not approved production imagery. No external media was downloaded.

Comparison protocol: same synthetic state, same viewport/theme/font, settled motion; compare shell bounds, type wrapping, input/button sizes, focus/error/empty states and overflow. Record intentional accessibility differences. T06 compares its new shell/components to these references; add authenticated synthetic provider references when a safe test environment exists.
## Practitioner and organization registration — owner revision, 2026-10-21

Use the existing Mhistree auth visual language for both account registration and staged applications: centered account card (600px maximum for the additional application fields), 32px radius/padding, heading and subtitle left/original logo right, neutral shared tokens, floating-label pill fields via AuthField, dark gradient pill actions and soft secondary pills. Five compact progress markers live inside the card. Owner refinement2026-10-21 removes the registration-type toggle; the separate patient-signup links select the route. no marketing column or navy palette. At480px and below use24px card padding, wrap headings/step names and preserve16px inputs. Everyone signs in through /auth; registration links appear only on signup. This supersedes the independent professional layout from2026-10-20. Scoped .pro-* CSS remains imported by app/layout.tsx.
