# CLAUDE.md

## Project Overview

**Terrain as Instrument** is an interactive web application that transforms the geographic terrain from Robert M. Pirsig's *Zen and the Art of Motorcycle Maintenance* into a hand-gesture-controlled musical instrument. Users interact via webcam hand tracking to play chords, trigger drum patterns, and generate ethereal visual effects overlaid on their camera feed.

The project is early-stage (v0.1.0) and uses a single-page architecture centered around one large interactive component.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 3
- **Hand Tracking**: MediaPipe Hands + Camera Utils
- **Audio**: Web Audio API (no external audio library)
- **Graphics**: Canvas 2D API (not Three.js, despite it being listed as a dependency)
- **Package Manager**: npm

## Project Structure

```
terrain-as-instrument/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root HTML layout with metadata
│   ├── page.tsx            # Home page - renders AirInstrument
│   └── globals.css         # Tailwind imports + CSS variables
├── components/
│   └── AirInstrument.tsx   # Main interactive component (~1128 lines)
├── data/
│   └── locations.ts        # Book locations with coordinates and metadata
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.ts          # Minimal/empty config
└── .eslintrc.json          # Extends next/core-web-vitals
```

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint (next/core-web-vitals rules)
```

There is no test framework or test suite configured.

## Architecture

### Single-Component Design

The entire interactive experience lives in `components/AirInstrument.tsx`. This is a `'use client'` component with four major subsystems:

1. **Hand Tracking** (MediaPipe): Detects two hands via webcam. Right hand = musical control, left hand = drum control. MediaPipe models load from CDN (`cdn.jsdelivr.net`).

2. **Audio Engine** (Web Audio API): Four oscillators (sawtooth, triangle, square, sine) routed through a lowpass filter and master gain. Drum sounds (kick, snare, hi-hat) are synthesized procedurally. Ambient noise runs continuously.

3. **Visual Rendering** (Canvas 2D): Draws mirrored camera feed as background, then layers ethereal visual elements: aura glows, dot patterns, organic lines, cloud bubbles, and trails. All visuals use a soft blue/coral/teal palette.

4. **Musical Logic**: Right hand X position selects root note (C through B), Y position selects chord type (major/minor/seventh). Pinch gesture controls filter cutoff and arpeggio speed. Left hand Y position selects drum zone (hat/snare/kick).

### Data Layer

`data/locations.ts` defines 8 locations from Pirsig's motorcycle journey (Minneapolis to Beartooth Pass) with coordinates, elevation, terrain type, chapter references, and narrative significance. Helper functions provide lookup by ID, terrain type, chapter, and distance calculation (Haversine formula). This data is not yet integrated into the interactive component.

### State Management

All real-time state uses `useRef` (not `useState`) to avoid re-renders during the animation loop. Only UI display parameters (`displayParams`) use `useState`, throttled to update every 100ms.

## Key Conventions

- **TypeScript strict mode** is enabled. All types are defined at the top of component files.
- **Path alias**: `@/*` maps to the project root (e.g., `import X from '@/components/X'`).
- **ESLint**: Extends `next/core-web-vitals` with no custom rules.
- **Component style**: Large single-file components with inline type definitions and constants. No separate hooks or utility files yet.
- **Styling**: Tailwind CSS utility classes in JSX. Some inline canvas drawing uses hardcoded color constants defined as partial RGBA strings (e.g., `'rgba(140, 180, 220, '`).
- **Font**: Georgia serif for canvas text and UI labels.
- **Camera mirroring**: Video is drawn mirrored (scaled -1 on X axis). Hand coordinates are also mirrored (`1 - x`).
- **MediaPipe handedness**: Labels are swapped (MediaPipe's "Right" label = user's left hand and vice versa, due to mirroring).

## Environment Variables

- `NEXT_PUBLIC_MAPBOX_TOKEN` - Mapbox access token (mentioned in README, not yet used in code)

## Notes for AI Assistants

- **Three.js** (`three`) is listed as a dependency but is not imported or used anywhere. The project uses Canvas 2D for all rendering. The `@types/three` dev dependency is also unused.
- The `lib/` and `public/` directories mentioned in the README do not exist yet.
- There are no tests. If adding tests, consider Vitest (compatible with Next.js) or Playwright for e2e.
- The `AirInstrument.tsx` component is large (~1128 lines). When modifying it, be precise about which section you're editing (types, constants, initialization, hand tracking, audio, animation/rendering, or lifecycle).
- All audio and visual processing happens in the `requestAnimationFrame` loop via the `animate()` function. Performance matters here.
- The `onHandResults` callback receives untyped MediaPipe results (`any`). Landmark arrays follow MediaPipe hand landmark indices (index 8 = index finger tip, index 4 = thumb tip).
- No CI/CD pipeline exists. Linting is the only automated quality check.
