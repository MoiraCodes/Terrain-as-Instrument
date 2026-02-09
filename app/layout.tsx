import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Terrain as Instrument',
  description: 'An interactive 3D journey through the terrain of Zen and the Art of Motorcycle Maintenance',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
