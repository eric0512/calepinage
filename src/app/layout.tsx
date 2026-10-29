import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Calepinage & Découpe de Panneaux Pro | Menuiserie',
  description:
    'Application web moderne d’optimisation de découpe et de calepinage 2D de panneaux pour la menuiserie avec prise en compte du trait de scie (kerf) et gestion des chutes.',
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
      </body>
    </html>
  );
}
