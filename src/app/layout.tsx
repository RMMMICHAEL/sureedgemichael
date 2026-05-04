import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SureEdge — Dashboard de Surebetting',
  description: 'Gerencie suas operações de surebetting com precisão. ROI em tempo real, calculadora de stakes e análise por bookmaker.',
  icons: {
    icon: '/icon',
    shortcut: '/icon',
    apple: '/icon',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
