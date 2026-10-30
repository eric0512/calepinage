import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';

export const viewport: Viewport = {
  themeColor: '#020617',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Calepinage & Découpe de Panneaux | Menuiserie',
  description:
    'Application web moderne d’optimisation de découpe et de calepinage 2D de panneaux pour la menuiserie.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Calepinage',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'application-name': 'Calepinage',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
