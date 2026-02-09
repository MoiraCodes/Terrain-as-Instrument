# Terrain as Instrument

An interactive 3D journey through the terrain of *Zen and the Art of Motorcycle Maintenance* by Robert M. Pirsig.

## Overview

This project transforms the geographic terrain from Pirsig's motorcycle journey into an interactive musical instrument. Using Three.js and Next.js, we visualize and sonify the landscapes traversed in the book, creating an immersive experience that connects place, philosophy, and sound.

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Three.js** - 3D graphics and visualization
- **Tailwind CSS** - Styling
- **Mapbox** - Geographic data and terrain

## Project Structure

```
terrain-as-instrument/
├── app/           # Next.js app directory (pages and layouts)
├── components/    # React components
├── lib/           # Utility functions and helpers
├── data/          # Static data (locations, routes, etc.)
└── public/        # Static assets
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up your Mapbox token:
   - Get a token from [Mapbox](https://account.mapbox.com/access-tokens/)
   - Add it to `.env.local`:
     ```
     NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
     ```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features (Planned)

- Interactive 3D terrain visualization
- Audio synthesis based on geographic features
- Journey waypoints from the book
- Real-time terrain-to-sound mapping

## License

MIT
