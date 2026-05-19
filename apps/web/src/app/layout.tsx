import type { Metadata } from 'next';
import { Fraunces, Geist_Mono, Inter, Lora, Manrope } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display',
  display: 'swap',
});

const fraunces = Fraunces({
  // next/font's Fraunces only ships latin / latin-ext / vietnamese subsets
  // (no cyrillic). Used for Latin display in existing surfaces.
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

// Editorial Cyrillic display serif added 2026-05-19 for /p/[publicSlug]
// storyboard redesign. Lora has full cyrillic support, italic + variable
// weight — used as the primary display face on the storyboard surface
// while Fraunces stays for Latin display elsewhere.
const lora = Lora({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-editorial',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mango Studio — AI-режиссёр мультиков',
  description: 'AI собирает короткий мультик из одной строки. TikTok, Reels, Shorts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${manrope.variable} ${fraunces.variable} ${lora.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
