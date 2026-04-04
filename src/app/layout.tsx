import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SureEdge — Dashboard de Surebetting',
  description: 'Gerencie suas operações de surebetting com precisão',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
