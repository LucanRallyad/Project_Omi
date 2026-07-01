# Reference assets for Romi's book recommender

Design and animation reference materials for this project. **Always read these when building UI, motion, or visual styling.**

## Primary reference (animation)

| File | Role |
|------|------|
| `ScreenRecording_06-30-2026 18-42-32_1.mov` | **#1 priority.** ~25s screen recording of the target coverflow carousel: 3D perspective tilt, centered focus card, side cards fanning out, momentum browse, tap-to-detail, mobile dark mode. Extract frames with ffmpeg if needed: `ffmpeg -i "reference/ScreenRecording_06-30-2026 18-42-32_1.mov" -vf "fps=2" /tmp/omi_frames/frame_%03d.png` |

## Visual inspiration (mood & palette)

| File | Mood / use |
|------|------------|
| `library.jpeg` | Cozy indie bookstore — warm wood, string lights, cream tones, literary atmosphere |
| `@livfontaine.jpeg` | Romantic reading nook — blush/cream, floor cushions, floor-to-ceiling shelves, soft natural light |
| `The 30 Best Things To Do In Edinburgh.jpeg` | Narrow bookshop aisle — warm dim lighting, patterned rugs, intimate literary feel |
| `2462974793287164.jpeg` | Open books flat-lay — cream paper texture, literary/romantic texture reference |
| `382383824636548051.jpeg` | Towering book stacks — rich spine colors, cozy clutter, book-lover energy |

## Design tokens (derived from these references)

- **Palette:** cream `#F5F0E8`, blush `#F4C2C2`, rose `#D4849A`, espresso `#3D2B1F`, gold accent `#C9A961`
- **Typography:** serif display (Playfair Display / Cormorant Garamond) + clean sans body (DM Sans)
- **Fallback covers:** clothbound-style mock (jewel-tone binding, linen texture, gold drop cap) — deterministic per book
- **Desktop background:** warm cream gradient; **mobile:** dark charcoal (per video)

## For agents

When implementing carousel, cards, welcome screen, or theme:

1. Re-watch or frame-extract the `.mov` first — motion is non-negotiable.
2. Use the JPEGs for color, texture, and cozy/romantic mood.
3. Full build plan: `.cursor/plans/book_recommender_site_a93efd90.plan.md`
