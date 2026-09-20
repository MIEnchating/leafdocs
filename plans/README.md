# Page and motion refinement

The user requested implementation with both supplied design and motion skills. The advisory stage is read-only; execution follows the UI architect protocol. `AUDIT.md` and `PLAN-TEMPLATE.md` were not supplied or found locally. Values below are explicit project decisions, not quotations from those missing files. No usable Git revision is available for this standalone project.

| Order | Plan | Status |
| --- | --- | --- |
| 1 | [Motion and surface refinement](001-motion-and-surfaces.md) | Done |

## Vetted audit

| Severity | Category | Evidence | Finding | Action |
| --- | --- | --- | --- | --- |
| Medium | Easing / cohesion | `src/app/globals.css:90,469,1154`; `src/app/admin/admin.css:37,1368` | Different timings and implicit default easing across buttons, cards, navigation and reveals. | Shared UI, overlay and editorial motion tokens. |
| Medium | Interruptibility | `src/components/public-shell.tsx:79,82` | Conditional unmount removes theme panel and scrim immediately. | Native dialogs retained in the DOM, with interruptible entry/exit transitions. |
| Medium | Accessibility | `src/components/public-shell.tsx:82`; `src/components/admin/workspace.tsx:372` | Mobile navigation lacks modal focus containment; explicit smooth outline scrolling bypasses reduced-motion preferences. | Native mobile navigation dialog; respect motion preferences in programmatic scrolling. |
| Medium | Purpose / frequency | `src/components/reveal.tsx:18`; `src/components/admin/workspace.tsx:364` | Every editor document opening uses the same reveal as the landing page, and hydration can hide already visible content. | Keep editor changes immediate; use bounded editorial reveals only on landing content. |
| Low | Performance | `src/app/globals.css:90,469` | Color and shadow transitions do not need frame-by-frame interpolation. | Animate transforms and opacity only; static material changes on hover. |

Opportunities: directional icon motion inside CTA buttons; a staged mobile menu reveal; a short save/copy acknowledgement. Preserve native code scrolling, instant keyboard search, SSR-visible content, and the root hydration compatibility fix.

## Implementation and verification

Implemented the floating navigation, split landing page, nested surfaces, light icons, directional CTA motion, shared motion tokens, native modal focus handling and reduced-motion behavior. Editor document switches are immediate. Root hydration compatibility remains intact. Constant-speed progress spinners deliberately retain linear rotation; they communicate ongoing work rather than navigation movement.

- Production build and TypeScript validation passed.
- Chromium, Firefox and WebKit: 31 dialog/scroll tests passed; the two Shift-wheel mapping cases remain intentionally skipped outside Chromium.
- Five login regressions passed, including native no-JavaScript form submission.
- Desktop/mobile smoke checks covered theme persistence, search, login, editor settings and draft preview without editing document content.
- Browser animation inspection confirmed 180ms theme-panel opacity/transform transitions, rapid reopen, and readable offscreen reveals. Extension-injected root attributes produced no hydration warning.
- Scroll tests measure the wheel delta after Playwright positions the pointer: Firefox may center the element during `hover()`, independently of actual wheel input.

Copy acknowledgement remains the existing label/icon feedback. No clipboard behavior, wheel forwarding, authentication, database or publication logic was changed.
