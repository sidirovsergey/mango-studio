import type { Metadata } from 'next';
import { Fraunces, Geist_Mono, Inter, Manrope } from 'next/font/google';
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
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
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
      className={`${inter.variable} ${manrope.variable} ${fraunces.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
