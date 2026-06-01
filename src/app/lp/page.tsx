import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'SureEdge — Dashboard Profissional de Surebet',
  description:
    'Plataforma profissional de gestão de surebets para traders brasileiros. Registre operações, calcule stakes com precisão matemática, monitore ROI por casa de aposta e importe da Green Surebet automaticamente.',
  robots: { index: false, follow: false },
};

export default function LandingRoute() {
  return <LandingPage />;
}
