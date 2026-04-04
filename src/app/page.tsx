'use client';

import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useStore } from '@/store/useStore';

export default function Home() {
  const init = useStore(s => s.init);
  useEffect(() => { init(); }, [init]);

  return <AppShell />;
}
