'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button }   from '@/components/ui/Button';
import { Modal }    from '@/components/ui/Modal';
import { bmColor }  from '@/lib/finance/reconciler';
import {
  Plus, Trash2, Pencil, TrendingUp, TrendingDown,
  KeyRound, Eye, EyeOff, Search, ChevronDown, ExternalLink,
  Building2, GitBranch,
} from 'lucide-react';
import type { Bookmaker, BookmakerCredentials, Bank } from '@/types';
import { houseFavicon } from '@/lib/bookmakers/logos';

// ── Clone groups data ─────────────────────────────────────────────────────────

// ── Helper: favicon URL from domain ──────────────────────────────────────────

function fav(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
}

interface HouseEntry { name: string; url: string; logo: string; }
interface CloneGroup { principal: HouseEntry; clones: HouseEntry[]; }

const CLONE_GROUPS: CloneGroup[] = [
  {
    principal: { name: 'Estrelabet',  url: 'https://www.estrelabet.bet.br',  logo: fav('estrelabet.bet.br') },
    clones: [
      { name: 'Nossabet',      url: 'https://www.nossa.bet.br',          logo: fav('nossa.bet.br') },
      { name: 'JogoDeOuro',    url: 'https://www.jogodeouro.bet.br',     logo: fav('jogodeouro.bet.br') },
      { name: 'MCGames',       url: 'https://www.mcgames.bet.br',        logo: fav('mcgames.bet.br') },
      { name: 'Multbet',       url: 'https://www.multi.bet.br',          logo: fav('multi.bet.br') },
      { name: 'Aposta1',       url: 'https://www.aposta1.bet.br',        logo: fav('aposta1.bet.br') },
      { name: 'Bateubet',      url: 'https://www.bateu.bet.br',          logo: fav('bateu.bet.br') },
      { name: 'Esportivabet',  url: 'https://www.esportiva.bet.br',      logo: fav('esportiva.bet.br') },
      { name: 'Goldebet',      url: 'https://www.goldebet.bet.br',       logo: fav('goldebet.bet.br') },
      { name: 'Lotogreen',     url: 'https://www.lotogreen.bet.br',      logo: fav('lotogreen.bet.br') },
      { name: 'Cassinopix',    url: 'https://www.cassino.bet.br',        logo: fav('cassino.bet.br') },
      { name: 'Vupi',          url: 'https://www.vupi.bet.br',           logo: fav('vupi.bet.br') },
      { name: 'Betfusion',     url: 'https://www.betfusion.bet.br',      logo: fav('betfusion.bet.br') },
      { name: 'SorteOnline',   url: 'https://www.sorteonline.bet.br',    logo: fav('sorteonline.bet.br') },
      { name: 'Lottoland',     url: 'https://www.lottoland.bet.br',      logo: fav('lottoland.bet.br') },
      { name: 'BrasildaSorte', url: 'https://www.brasildasorte.bet.br',  logo: fav('brasildasorte.bet.br') },
      { name: 'BR4Bet',        url: 'https://www.br4.bet.br',            logo: fav('br4.bet.br') },
      { name: 'UPbet',         url: 'https://www.up.bet.br',             logo: fav('up.bet.br') },
      { name: 'Pagol',         url: 'https://www.pagol.bet.br',          logo: fav('pagol.bet.br') },
      { name: 'Aviaobet',      url: 'https://www.aviao.bet.br',          logo: fav('aviao.bet.br') },
    ],
  },
  {
    principal: { name: 'Bet7k',  url: 'https://www.7k.bet.br',  logo: fav('7k.bet.br') },
    clones: [
      { name: 'MMABET',      url: 'https://www.mma.bet.br',          logo: fav('mma.bet.br') },
      { name: 'Pixbet',      url: 'https://www.pix.bet.br',          logo: fav('pix.bet.br') },
      { name: 'BetDaSorte',  url: 'https://www.betdasorte.bet.br',   logo: fav('betdasorte.bet.br') },
      { name: 'Betaki',      url: 'https://www.betaki.bet.br',       logo: fav('betaki.bet.br') },
      { name: 'Ricobet',     url: 'https://www.rico.bet.br',         logo: fav('rico.bet.br') },
      { name: 'BRXBet',      url: 'https://www.brx.bet.br',          logo: fav('brx.bet.br') },
      { name: 'ApostaMax',   url: 'https://www.apostamax.bet.br',    logo: fav('apostamax.bet.br') },
      { name: 'Betgorillas', url: 'https://www.betgorillas.bet.br',  logo: fav('betgorillas.bet.br') },
      { name: 'Betbufalos',  url: 'https://www.betbuffalos.bet.br',  logo: fav('betbuffalos.bet.br') },
      { name: 'Betfalcons',  url: 'https://www.betfalcons.bet.br',   logo: fav('betfalcons.bet.br') },
      { name: 'ApostaTudo',  url: 'https://www.apostatudo.bet.br',   logo: fav('apostatudo.bet.br') },
      { name: 'B1Bet',       url: 'https://www.b1bet.bet.br',        logo: fav('b1bet.bet.br') },
      { name: 'Betpontobet', url: 'https://www.betpontobet.bet.br',  logo: fav('betpontobet.bet.br') },
      { name: 'Donaldbet',   url: 'https://www.donald.bet.br',       logo: fav('donald.bet.br') },
      { name: 'Bullsbet',    url: 'https://www.bullsbet.bet.br',     logo: fav('bullsbet.bet.br') },
      { name: 'Jogaobet',    url: 'https://www.jogao.bet.br',        logo: fav('jogao.bet.br') },
      { name: 'Liderbet',    url: 'https://www.lider.bet.br',        logo: fav('lider.bet.br') },
      { name: 'B2x',         url: 'https://www.b2x.bet.br',          logo: fav('b2x.bet.br') },
      { name: 'Verabet',     url: 'https://www.vera.bet.br',         logo: fav('vera.bet.br') },
      { name: 'Sortenabet',  url: 'https://www.sortenabet.bet.br',   logo: fav('sortenabet.bet.br') },
      { name: 'Betou',       url: 'https://www.betou.bet.br',        logo: fav('betou.bet.br') },
      { name: 'Kingpanda',   url: 'https://www.kingpanda.bet.br',    logo: fav('kingpanda.bet.br') },
      { name: 'Icebet',      url: 'https://www.ice.bet.br',          logo: fav('ice.bet.br') },
      { name: 'Geralbet',    url: 'https://www.geralbet.bet.br',     logo: fav('geralbet.bet.br') },
    ],
  },
  {
    principal: { name: 'Blaze',  url: 'https://www.blaze.bet.br',  logo: fav('blaze.bet.br') },
    clones: [
      { name: 'BetVip',    url: 'https://www.betvip.bet.br',    logo: fav('betvip.bet.br') },
      { name: 'Jonbet',    url: 'https://www.jonbet.bet.br',    logo: fav('jonbet.bet.br') },
      { name: 'Uxbet',     url: 'https://www.ux.bet.br',        logo: fav('ux.bet.br') },
      { name: 'Afunbet',   url: 'https://www.afun.bet.br',      logo: fav('afun.bet.br') },
      { name: 'Ganheibet', url: 'https://www.ganhei.bet.br',    logo: fav('ganhei.bet.br') },
    ],
  },
  {
    principal: { name: 'Onabet',  url: 'https://www.ona.bet.br',  logo: fav('ona.bet.br') },
    clones: [
      { name: 'Esporte365', url: 'https://www.esporte365.bet.br', logo: fav('esporte365.bet.br') },
      { name: 'Luckbet',    url: 'https://www.luck.bet.br',       logo: fav('luck.bet.br') },
      { name: '1praum',     url: 'https://www.1pra1.bet.br',      logo: fav('1pra1.bet.br') },
      { name: 'Starbet',    url: 'https://www.start.bet.br',      logo: fav('start.bet.br') },
      { name: 'Realsbet',   url: 'https://www.reals.bet.br',      logo: fav('reals.bet.br') },
      { name: 'Bigbet',     url: 'https://www.big.bet.br',        logo: fav('big.bet.br') },
      { name: 'Apostar',    url: 'https://www.apostar.bet.br',    logo: fav('apostar.bet.br') },
      { name: 'Luvabet',    url: 'https://www.luva.bet.br',       logo: fav('luva.bet.br') },
    ],
  },
  {
    principal: { name: 'Vbet',  url: 'https://www.vbet.bet.br',  logo: fav('vbet.bet.br') },
    clones: [
      { name: 'Bravobet',  url: 'https://www.bravo.bet.br',       logo: fav('bravo.bet.br') },
      { name: 'H2Bet',     url: 'https://www.h2.bet.br',          logo: fav('h2.bet.br') },
      { name: 'Supremabet',url: 'https://www.suprema.bet.br',     logo: fav('suprema.bet.br') },
      { name: 'Segurobet', url: 'https://www.seguro.bet.br',      logo: fav('seguro.bet.br') },
      { name: 'Betpark',   url: 'https://www.betpark.bet.br',     logo: fav('betpark.bet.br') },
      { name: '7Games',    url: 'https://www.7games.bet.br',      logo: fav('7games.bet.br') },
      { name: 'Betao',     url: 'https://www.betao.bet.br',       logo: fav('betao.bet.br') },
      { name: 'R7bet',     url: 'https://www.r7.bet.br',          logo: fav('r7.bet.br') },
      { name: 'Maximabet', url: 'https://www.maxima.bet.br',      logo: fav('maxima.bet.br') },
      { name: 'Ultrabet',  url: 'https://www.ultra.bet.br',       logo: fav('ultra.bet.br') },
    ],
  },
  {
    principal: { name: 'Betfast',  url: 'https://www.betfast.bet.br',  logo: fav('betfast.bet.br') },
    clones: [
      { name: 'Faz1bet', url: 'https://www.faz1.bet.br',    logo: fav('faz1.bet.br') },
      { name: 'Tivobet', url: 'https://www.tivo.bet.br',    logo: fav('tivo.bet.br') },
      { name: 'Ijogo',   url: 'https://www.ijogo.bet.br',   logo: fav('ijogo.bet.br') },
      { name: '9fbet',   url: 'https://www.9f.bet.br',      logo: fav('9f.bet.br') },
      { name: '9dbet',   url: 'https://www.9d.bet.br',      logo: fav('9d.bet.br') },
      { name: '6zbet',   url: 'https://www.6z.bet.br',      logo: fav('6z.bet.br') },
    ],
  },
  {
    principal: { name: 'Stake',  url: 'https://www.stake.bet.br',  logo: fav('stake.bet.br') },
    clones: [
      { name: 'BetMGM', url: 'https://www.betmgm.bet.br', logo: fav('betmgm.bet.br') },
      { name: 'KTO',    url: 'https://www.kto.bet.br',    logo: fav('kto.bet.br') },
    ],
  },
  {
    principal: { name: 'Sportingbet',  url: 'https://www.sportingbet.bet.br',  logo: fav('sportingbet.bet.br') },
    clones: [
      { name: 'Betboo', url: 'https://www.betboo.bet.br', logo: fav('betboo.bet.br') },
    ],
  },
  {
    principal: { name: 'Betfair',  url: 'https://www.betfair.bet.br',  logo: fav('betfair.bet.br') },
    clones: [
      { name: 'Bolsadeaposta', url: 'https://www.bolsadeaposta.bet.br', logo: fav('bolsadeaposta.bet.br') },
      { name: 'Fullbet',       url: 'https://www.fulltbet.bet.br',      logo: fav('fulltbet.bet.br') },
      { name: 'Bet-Bra',       url: 'https://www.betbra.bet.br',        logo: fav('betbra.bet.br') },
    ],
  },
];

const SEM_CLONE: HouseEntry[] = [
  { name: 'Betnacional', url: 'https://www.betnacional.bet.br', logo: fav('betnacional.bet.br') },
  { name: 'Superbet',    url: 'https://www.super.bet.br',       logo: fav('super.bet.br') },
  { name: 'Sportybet',   url: 'https://www.sporty.bet.br',      logo: fav('sporty.bet.br') },
  { name: 'Pinnacle',    url: 'https://www.pinnacle.bet.br',    logo: fav('pinnacle.bet.br') },
  { name: 'Betano',      url: 'https://www.betano.bet.br',      logo: fav('betano.bet.br') },
  { name: 'Novibet',     url: 'https://www.novibet.bet.br',     logo: fav('novibet.bet.br') },
  { name: 'Bet365',      url: 'https://www.bet365.bet.br',      logo: fav('bet365.bet.br') },
  { name: 'Rivalo',      url: 'https://www.rivalo.bet.br',      logo: fav('rivalo.bet.br') },
  { name: 'Betsson',     url: 'https://www.betsson.bet.br',     logo: fav('betsson.bet.br') },
  { name: 'Betwarrior',  url: 'https://www.betwarrior.bet.br',  logo: fav('betwarrior.bet.br') },
];

// ── Full catalog for "Minhas Casas" form picker ───────────────────────────────

const CATALOG: { name: string; color: string; domain: string }[] = [
  /* ── Independentes ── */
  { name: 'Betnacional',  color: '#1E40AF', domain: 'betnacional.bet.br' },
  { name: 'Superbet',     color: '#6B21A8', domain: 'super.bet.br' },
  { name: 'Sportybet',    color: '#166534', domain: 'sporty.bet.br' },
  { name: 'Pinnacle',     color: '#374151', domain: 'pinnacle.bet.br' },
  { name: 'Betano',       color: '#CC0B2F', domain: 'betano.bet.br' },
  { name: 'Novibet',      color: '#14532D', domain: 'novibet.bet.br' },
  { name: 'Bet365',       color: '#003087', domain: 'bet365.bet.br' },
  { name: 'Rivalo',       color: '#1D4ED8', domain: 'rivalo.bet.br' },
  { name: 'Betsson',      color: '#FB923C', domain: 'betsson.bet.br' },
  { name: 'Betwarrior',   color: '#FB923C', domain: 'betwarrior.bet.br' },
  /* ── Grupo Estrelabet ── */
  { name: 'Estrelabet',   color: '#9A3412', domain: 'estrelabet.bet.br' },
  { name: 'Nossabet',     color: '#7C3AED', domain: 'nossa.bet.br' },
  { name: 'JogoDeOuro',   color: '#854D0E', domain: 'jogodeouro.bet.br' },
  { name: 'MCGames',      color: '#4338CA', domain: 'mcgames.bet.br' },
  { name: 'Multbet',      color: '#0F766E', domain: 'multi.bet.br' },
  { name: 'Aposta1',      color: '#B45309', domain: 'aposta1.bet.br' },
  { name: 'Bateubet',     color: '#7C3AED', domain: 'bateu.bet.br' },
  { name: 'Esportivabet', color: '#166534', domain: 'esportiva.bet.br' },
  { name: 'Goldebet',     color: '#B45309', domain: 'goldebet.bet.br' },
  { name: 'Lotogreen',    color: '#166534', domain: 'lotogreen.bet.br' },
  { name: 'Cassinopix',   color: '#0E7490', domain: 'cassino.bet.br' },
  { name: 'Vupi',         color: '#B91C1C', domain: 'vupi.bet.br' },
  { name: 'Betfusion',    color: '#1D4ED8', domain: 'betfusion.bet.br' },
  { name: 'SorteOnline',  color: '#047857', domain: 'sorteonline.bet.br' },
  { name: 'Lottoland',    color: '#0F172A', domain: 'lottoland.bet.br' },
  { name: 'BrasildaSorte',color: '#166534', domain: 'brasildasorte.bet.br' },
  { name: 'BR4Bet',       color: '#0F766E', domain: 'br4.bet.br' },
  { name: 'UPbet',        color: '#1D4ED8', domain: 'up.bet.br' },
  { name: 'Pagol',        color: '#854D0E', domain: 'pagol.bet.br' },
  { name: 'Aviaobet',     color: '#DC2626', domain: 'aviao.bet.br' },
  /* ── Grupo Bet7k ── */
  { name: 'Bet7k',        color: '#0F172A', domain: '7k.bet.br' },
  { name: 'MMABET',       color: '#DC2626', domain: 'mma.bet.br' },
  { name: 'Pixbet',       color: '#B45309', domain: 'pix.bet.br' },
  { name: 'BetDaSorte',   color: '#B91C1C', domain: 'betdasorte.bet.br' },
  { name: 'Betaki',       color: '#4338CA', domain: 'betaki.bet.br' },
  { name: 'Ricobet',      color: '#047857', domain: 'rico.bet.br' },
  { name: 'BRXBet',       color: '#0369A1', domain: 'brx.bet.br' },
  { name: 'ApostaMax',    color: '#B45309', domain: 'apostamax.bet.br' },
  { name: 'Betgorillas',  color: '#166534', domain: 'betgorillas.bet.br' },
  { name: 'Betbufalos',   color: '#0F172A', domain: 'betbuffalos.bet.br' },
  { name: 'Betfalcons',   color: '#1D4ED8', domain: 'betfalcons.bet.br' },
  { name: 'ApostaTudo',   color: '#854D0E', domain: 'apostatudo.bet.br' },
  { name: 'B1Bet',        color: '#7C3AED', domain: 'b1bet.bet.br' },
  { name: 'Betpontobet',  color: '#1E40AF', domain: 'betpontobet.bet.br' },
  { name: 'Donaldbet',    color: '#DC2626', domain: 'donald.bet.br' },
  { name: 'Bullsbet',     color: '#0F766E', domain: 'bullsbet.bet.br' },
  { name: 'Jogaobet',     color: '#166534', domain: 'jogao.bet.br' },
  { name: 'Liderbet',     color: '#B45309', domain: 'lider.bet.br' },
  { name: 'B2x',          color: '#0369A1', domain: 'b2x.bet.br' },
  { name: 'Verabet',      color: '#047857', domain: 'vera.bet.br' },
  { name: 'Sortenabet',   color: '#1E40AF', domain: 'sortenabet.bet.br' },
  { name: 'Betou',        color: '#854D0E', domain: 'betou.bet.br' },
  { name: 'Kingpanda',    color: '#0F172A', domain: 'kingpanda.bet.br' },
  { name: 'Icebet',       color: '#0369A1', domain: 'ice.bet.br' },
  { name: 'Geralbet',     color: '#166534', domain: 'geralbet.bet.br' },
  /* ── Grupo Blaze ── */
  { name: 'Blaze',        color: '#DC2626', domain: 'blaze.bet.br' },
  { name: 'BetVip',       color: '#7C3AED', domain: 'betvip.bet.br' },
  { name: 'Jonbet',       color: '#0369A1', domain: 'jonbet.bet.br' },
  { name: 'Uxbet',        color: '#1E40AF', domain: 'ux.bet.br' },
  { name: 'Afunbet',      color: '#047857', domain: 'afun.bet.br' },
  { name: 'Ganheibet',    color: '#166534', domain: 'ganhei.bet.br' },
  /* ── Grupo Onabet ── */
  { name: 'Onabet',       color: '#0E7490', domain: 'ona.bet.br' },
  { name: 'Esporte365',   color: '#166534', domain: 'esporte365.bet.br' },
  { name: 'Luckbet',      color: '#1D4ED8', domain: 'luck.bet.br' },
  { name: '1praum',       color: '#B45309', domain: '1pra1.bet.br' },
  { name: 'Starbet',      color: '#0F766E', domain: 'start.bet.br' },
  { name: 'Realsbet',     color: '#047857', domain: 'reals.bet.br' },
  { name: 'Bigbet',       color: '#7C3AED', domain: 'big.bet.br' },
  { name: 'Apostar',      color: '#854D0E', domain: 'apostar.bet.br' },
  { name: 'Luvabet',      color: '#DC2626', domain: 'luva.bet.br' },
  /* ── Grupo Vbet ── */
  { name: 'Vbet',         color: '#7C2D12', domain: 'vbet.bet.br' },
  { name: 'Bravobet',     color: '#0F172A', domain: 'bravo.bet.br' },
  { name: 'H2Bet',        color: '#0E7490', domain: 'h2.bet.br' },
  { name: 'Supremabet',   color: '#1D4ED8', domain: 'suprema.bet.br' },
  { name: 'Segurobet',    color: '#166534', domain: 'seguro.bet.br' },
  { name: 'Betpark',      color: '#854D0E', domain: 'betpark.bet.br' },
  { name: '7Games',       color: '#7C3AED', domain: '7games.bet.br' },
  { name: 'Betao',        color: '#0F766E', domain: 'betao.bet.br' },
  { name: 'R7bet',        color: '#DC2626', domain: 'r7.bet.br' },
  { name: 'Maximabet',    color: '#1E40AF', domain: 'maxima.bet.br' },
  { name: 'Ultrabet',     color: '#0369A1', domain: 'ultra.bet.br' },
  /* ── Grupo Betfast ── */
  { name: 'Betfast',      color: '#B91C1C', domain: 'betfast.bet.br' },
  { name: 'Faz1bet',      color: '#047857', domain: 'faz1.bet.br' },
  { name: 'Tivobet',      color: '#4338CA', domain: 'tivo.bet.br' },
  { name: 'Ijogo',        color: '#1D4ED8', domain: 'ijogo.bet.br' },
  { name: '9fbet',        color: '#0F172A', domain: '9f.bet.br' },
  { name: '9dbet',        color: '#B45309', domain: '9d.bet.br' },
  { name: '6zbet',        color: '#166534', domain: '6z.bet.br' },
  /* ── Grupo Stake ── */
  { name: 'Stake',        color: '#047857', domain: 'stake.bet.br' },
  { name: 'BetMGM',       color: '#0F766E', domain: 'betmgm.bet.br' },
  { name: 'KTO',          color: '#1D4ED8', domain: 'kto.bet.br' },
  /* ── Grupo Sportingbet ── */
  { name: 'Sportingbet',  color: '#0A5C1F', domain: 'sportingbet.bet.br' },
  { name: 'Betboo',       color: '#7C3AED', domain: 'betboo.bet.br' },
  /* ── Grupo Betfair ── */
  { name: 'Betfair',      color: '#0E7490', domain: 'betfair.bet.br' },
  { name: 'Bolsadeaposta',color: '#854D0E', domain: 'bolsadeaposta.bet.br' },
  { name: 'Fullbet',      color: '#166534', domain: 'fulltbet.bet.br' },
  { name: 'Bet-Bra',      color: '#DC2626', domain: 'betbra.bet.br' },
];

function abbr(name: string) { return (name || '?').slice(0, 3).toUpperCase(); }

function FavIcon({ logo, name, size = 20 }: { logo: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!err) {
    return (
      <img
        src={logo}
        alt={name}
        width={size}
        height={size}
        onError={() => setErr(true)}
        style={{ borderRadius: 4, objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return (
    <span style={{ fontSize: size * 0.55, fontWeight: 700, lineHeight: 1 }}>
      {abbr(name)}
    </span>
  );
}

function fmtBRL(v: number) {
  const sign = v < 0 ? '−' : '+';
  return `${sign} R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Catalog picker modal ──────────────────────────────────────────────────────

function CatalogFavIcon({ domain, name }: { domain: string; name: string }) {
  const [err, setErr] = useState(false);
  if (!err) {
    return (
      <img
        src={fav(domain)}
        alt={name}
        width={20}
        height={20}
        onError={() => setErr(true)}
        style={{ borderRadius: 4, objectFit: 'contain', display: 'block', flexShrink: 0 }}
      />
    );
  }
  return (
    <span className="text-xs font-bold" style={{ color: 'inherit' }}>
      {abbr(name)}
    </span>
  );
}

function CatalogModal({ onSelect, onClose }: {
  onSelect: (name: string, color: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() =>
    CATALOG.filter(c => c.name.toLowerCase().includes(q.toLowerCase())), [q]
  );
  return (
    <Modal title="Selecionar Casa de Aposta" onClose={onClose} size="md">
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar casa..." autoFocus
          className="w-full pl-8 pr-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-80 overflow-y-auto">
        {filtered.map(c => (
          <button key={c.name} onClick={() => onSelect(c.name, c.color)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium w-full transition-all"
            style={{ color: 'var(--t)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sur)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: c.color + '22', color: c.color }}>
              <CatalogFavIcon domain={c.domain} name={c.name} />
            </span>
            <span className="truncate">{c.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 text-center py-4 text-sm" style={{ color: 'var(--t3)' }}>Nenhuma casa encontrada.</p>
        )}
      </div>
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
        <button onClick={() => onSelect(q || 'Nova Casa', '#374151')}
          className="w-full py-2 rounded-lg text-sm font-bold"
          style={{ background: 'var(--sur)', color: 'var(--t2)', border: '1px solid var(--b)' }}>
          + Adicionar "{q || 'outra casa'}" manualmente
        </button>
      </div>
    </Modal>
  );
}

// ── BM form ───────────────────────────────────────────────────────────────────

interface BMFormProps { existing?: Bookmaker; presetName?: string; presetColor?: string; onClose: () => void; }

function BMForm({ existing, presetName, presetColor, onClose }: BMFormProps) {
  const addBookmaker    = useStore(s => s.addBookmaker);
  const updateBookmaker = useStore(s => s.updateBookmaker);
  const toastFn         = useStore(s => s.toast);

  const [name,    setName]    = useState(existing?.name    ?? presetName  ?? '');
  const [color,   setColor]   = useState(existing?.color   ?? presetColor ?? '#374151');
  const [balance, setBalance] = useState(existing ? String(existing.initial_balance) : '');
  const [notes,   setNotes]   = useState(existing?.notes   ?? '');
  const [status,  setStatus]  = useState<Bookmaker['status']>(existing?.status ?? 'ativa');
  const [username, setUsername] = useState(existing?.credentials?.username ?? '');
  const [password, setPassword] = useState(existing?.credentials?.password ?? '');
  const [showPass, setShowPass] = useState(false);
  const [credNotes, setCredNotes] = useState(existing?.credentials?.notes ?? '');
  const [showCreds, setShowCreds] = useState(false);

  function save() {
    if (!name.trim()) { toastFn('Nome obrigatório', 'wrn'); return; }
    const initial_balance = parseFloat(balance.replace(',', '.')) || 0;
    const credentials: BookmakerCredentials | undefined =
      username.trim() ? { username: username.trim(), password, notes: credNotes } : undefined;
    if (existing) {
      updateBookmaker(existing.id, { name: name.trim(), color, initial_balance, notes, status, credentials });
      toastFn('Casa atualizada', 'ok');
    } else {
      addBookmaker({ name: name.trim(), abbr: abbr(name), color, initial_balance, status, notes, credentials });
      toastFn('Casa adicionada', 'ok');
    }
    onClose();
  }

  const inputStyle = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };
  const labelStyle = { color: 'var(--t3)' };

  return (
    <Modal title={existing ? 'Editar Casa' : 'Nova Casa de Aposta'} onClose={onClose} size="sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold" style={labelStyle}>NOME DA CASA</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bet365"
                className="px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            </label>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mb-0.5"
            style={{ background: color + '22', color }}>
            {abbr(name || '?')}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={labelStyle}>SALDO INICIAL (R$)</span>
          <input value={balance} onChange={e => setBalance(e.target.value)} placeholder="0,00"
            className="px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
          <span className="text-xs" style={labelStyle}>Valor atualmente depositado. Manual — não é afetado por dados importados.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={labelStyle}>STATUS</span>
          <select value={status} onChange={e => setStatus(e.target.value as Bookmaker['status'])}
            className="px-3 py-2.5 rounded-lg text-sm" style={inputStyle}>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="limitada">Limitada</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={labelStyle}>OBSERVAÇÕES</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Limitações, notas..." className="px-3 py-2.5 rounded-lg text-sm resize-none" style={inputStyle} />
        </label>

        <div style={{ border: '1px solid var(--b)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setShowCreds(v => !v)}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium text-left"
            style={{ background: 'var(--sur)', color: 'var(--t2)' }}>
            <KeyRound size={14} />
            <span className="flex-1">Credenciais de acesso (opcional)</span>
            <ChevronDown size={14} style={{ transform: showCreds ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
          {showCreds && (
            <div className="flex flex-col gap-2 p-3" style={{ background: 'var(--bg)' }}>
              <p className="text-xs" style={{ color: 'var(--y)' }}>⚠️ Salvo apenas localmente no seu navegador.</p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold" style={labelStyle}>USUÁRIO / E-MAIL</span>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario@email.com"
                  className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold" style={labelStyle}>SENHA</span>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg text-sm pr-9" style={inputStyle} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold" style={labelStyle}>NOTAS</span>
                <input value={credNotes} onChange={e => setCredNotes(e.target.value)}
                  placeholder="Ex: conta principal, verificada..." className="px-3 py-2 rounded-lg text-sm" style={inputStyle} />
              </label>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>{existing ? 'Salvar alterações' : 'Adicionar casa'}</Button>
      </div>
    </Modal>
  );
}

// ── Bank form modal ───────────────────────────────────────────────────────────

function BankForm({ existing, onClose }: { existing?: Bank; onClose: () => void }) {
  const addBank    = useStore(s => s.addBank);
  const deleteBank = useStore(s => s.deleteBank);
  const toastFn    = useStore(s => s.toast);

  const [name,    setName]    = useState(existing?.name    ?? '');
  const [balance, setBalance] = useState(existing ? String(existing.balance) : '');
  const [notes,   setNotes]   = useState(existing?.notes   ?? '');

  const inputStyle = { background: 'var(--sur)', border: '1px solid var(--b2)', color: 'var(--t)' };

  function save() {
    if (!name.trim()) { toastFn('Nome obrigatório', 'wrn'); return; }
    addBank({ name: name.trim(), balance: parseFloat(balance.replace(',', '.')) || 0, notes });
    toastFn('Banco adicionado', 'ok');
    onClose();
  }

  return (
    <Modal title="Adicionar Banco" onClose={onClose} size="sm">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>NOME DO BANCO</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank, Itaú..."
            className="px-3 py-2.5 rounded-lg text-sm" style={inputStyle} autoFocus />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>SALDO (R$)</span>
          <input value={balance} onChange={e => setBalance(e.target.value)} placeholder="0,00"
            className="px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold" style={{ color: 'var(--t3)' }}>OBSERVAÇÕES</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
            className="px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={save}>Adicionar</Button>
      </div>
    </Modal>
  );
}

// ── Clone group card ──────────────────────────────────────────────────────────

function CloneGroupCard({ group, open, onToggle }: { group: CloneGroup; open: boolean; onToggle: () => void }) {
  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ background: 'var(--sur)', border: `1px solid ${open ? 'var(--b2)' : 'var(--b)'}` }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(61,255,143,.08)', border: '1px solid rgba(61,255,143,.15)' }}
        >
          <FavIcon logo={group.principal.logo} name={group.principal.name} size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--t)' }}>{group.principal.name}</div>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(61,255,143,.06)', color: 'var(--g)', border: '1px solid rgba(61,255,143,.12)' }}
        >
          {group.clones.length}
        </span>
        <a
          href={group.principal.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ color: 'var(--t3)' }}
        >
          <ExternalLink size={11} />
        </a>
        <ChevronDown
          size={14}
          style={{ color: 'var(--t3)', transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s', flexShrink: 0 }}
        />
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--b)' }}>
          {group.clones.map((clone, i) => (
            <div
              key={clone.name}
              className="flex items-center gap-3 px-4 py-2"
              style={{
                borderBottom: i < group.clones.length - 1 ? '1px solid var(--b)' : 'none',
              }}
            >
              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,.05)' }}>
                <FavIcon logo={clone.logo} name={clone.name} size={14} />
              </div>
              <span className="text-xs flex-1" style={{ color: 'var(--t2)' }}>{clone.name}</span>
              <a
                href={clone.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs flex-shrink-0"
                style={{ color: 'var(--t3)' }}
              >
                <ExternalLink size={10} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function BookmakersPage() {
  const bms             = useStore(s => s.bms);
  const banks           = useStore(s => s.banks);
  const deleteBookmaker = useStore(s => s.deleteBookmaker);
  const deleteBank      = useStore(s => s.deleteBank);
  const toastFn         = useStore(s => s.toast);

  const [tab,         setTab]         = useState<'minhas' | 'clones'>('minhas');
  const [showCatalog, setShowCatalog] = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [showBankForm,setShowBankForm]= useState(false);
  const [editing,     setEditing]     = useState<Bookmaker | undefined>(undefined);
  const [presetName,  setPresetName]  = useState('');
  const [presetColor, setPresetColor] = useState('');
  const [cloneSearch, setCloneSearch] = useState('');
  const [openCloneId, setOpenCloneId] = useState<string | null>(null);

  const totalBmCash   = bms.reduce((s, b) => s + b.balance, 0);
  const totalBankCash = banks.reduce((s, b) => s + b.balance, 0);

  function handleCatalogSelect(name: string, color: string) {
    setPresetName(name); setPresetColor(color);
    setEditing(undefined); setShowCatalog(false); setShowForm(true);
  }

  function openEdit(bm: Bookmaker) {
    setEditing(bm); setPresetName(''); setPresetColor(''); setShowForm(true);
  }

  const statusColors: Record<string, string> = { ativa: 'var(--g)', inativa: 'var(--t3)', limitada: 'var(--y)' };
  const statusLabels: Record<string, string> = { ativa: 'Ativa', inativa: 'Inativa', limitada: 'Limitada' };

  const filteredGroups = useMemo(() => {
    if (!cloneSearch.trim()) return CLONE_GROUPS;
    const q = cloneSearch.toLowerCase();
    return CLONE_GROUPS.filter(g =>
      g.principal.name.toLowerCase().includes(q) ||
      g.clones.some(c => c.name.toLowerCase().includes(q))
    );
  }, [cloneSearch]);

  const filteredSemClone = useMemo(() => {
    if (!cloneSearch.trim()) return SEM_CLONE;
    const q = cloneSearch.toLowerCase();
    return SEM_CLONE.filter(h => h.name.toLowerCase().includes(q));
  }, [cloneSearch]);

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--t)' }}>Casas de Aposta</h2>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--t3)' }}>
            {bms.length} {bms.length === 1 ? 'casa' : 'casas'} cadastradas
          </p>
        </div>
        {tab === 'minhas' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowBankForm(true)}>
              <Plus size={14} /> Banco
            </Button>
            <Button variant="primary" onClick={() => setShowCatalog(true)}>
              <Plus size={14} /> Casa
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--sur)', width: 'fit-content' }}>
        {([['minhas', Building2, 'Minhas Casas'], ['clones', GitBranch, 'Clones Bets']] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={tab === id
              ? { background: 'var(--g)', color: 'var(--bg)', boxShadow: '0 0 12px rgba(0,255,136,.25)' }
              : { color: 'var(--t3)' }
            }
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Minhas Casas ── */}
      {tab === 'minhas' && (
        <>
          {/* Observation note */}
          {bms.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-xs"
              style={{ background: 'rgba(63,255,33,.06)', border: '1px solid rgba(63,255,33,.15)', color: 'var(--t2)' }}>
              <span style={{ color: 'var(--g)', flexShrink: 0, marginTop: 1 }}>ℹ</span>
              <span>O site sincronizou as casas mais utilizadas da sua operação. Caso você não tenha alguma das casas abaixo, pode remover e editar!</span>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Saldo em Casas de Apostas', value: fmtBRL(totalBmCash),   color: totalBmCash >= 0   ? 'var(--g)' : 'var(--r)' },
              { label: 'Saldo em Bancos',           value: fmtBRL(totalBankCash), color: 'var(--bl)' },
            ].map(k => (
              <div key={k.label} className="rounded-2xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
                <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--t2)' }}>{k.label}</div>
                <div className="text-xl font-extrabold font-mono" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {!bms.length ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
              <p className="text-3xl mb-2">🏦</p>
              <p className="font-bold mb-1" style={{ color: 'var(--t)' }}>Nenhuma casa cadastrada</p>
              <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
                Adicione suas casas e informe o saldo atual de cada uma
              </p>
              <Button variant="primary" onClick={() => setShowCatalog(true)}>+ Adicionar Casa</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {bms.map(bm => {
                const profit = bm.balance - bm.initial_balance;
                const col    = bm.color || bmColor(bm.name);
                return (
                  <div
                    key={bm.id}
                    className="rounded-2xl p-5 flex flex-col gap-4 transition-all"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = '1px solid var(--b2)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.3)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = '1px solid var(--b)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: col + '22', color: col, border: `1px solid ${col}44` }}>
                        {(() => {
                          const logo = houseFavicon(bm.name);
                          if (logo) return <FavIcon logo={logo} name={bm.name} size={28} />;
                          return bm.abbr;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate" style={{ color: 'var(--t)' }}>{bm.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[bm.status] }} />
                          <span className="text-xs capitalize" style={{ color: 'var(--t3)' }}>{statusLabels[bm.status]}</span>
                          <span className="text-xs font-mono ml-2" style={{ color: 'var(--t3)' }}>{bm.ops} ops</span>
                          {bm.credentials?.username && (
                            <span className="ml-1 text-xs px-1.5 py-0.5 rounded font-mono"
                              style={{ background: 'var(--sur)', color: 'var(--t3)' }} title={`Usuário: ${bm.credentials.username}`}>
                              🔑
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(bm)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: 'var(--t3)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sur2)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Remover ${bm.name}?`)) { deleteBookmaker(bm.id); toastFn('Casa removida', 'ok'); } }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ color: 'var(--r)', background: 'var(--rd)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl p-3" style={{ background: 'var(--bg3, var(--bg))' }}>
                      <div className="text-xs mb-0.5" style={{ color: 'var(--t3)' }}>Saldo atual</div>
                      <div className="text-lg font-extrabold font-mono"
                        style={{ color: 'var(--g)' }}>
                        R$ {Math.abs(bm.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Banks section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
                Bancos ({banks.length})
              </span>
            </div>
            {banks.length === 0 ? (
              <div className="rounded-xl p-4 text-center text-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t3)' }}>
                Nenhum banco cadastrado. Clique em "+ Banco" para adicionar.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {banks.map(bank => (
                  <div key={bank.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: 'rgba(77,166,255,.1)', color: 'var(--bl)', border: '1px solid rgba(77,166,255,.2)' }}>
                      {(bank.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-semibold text-sm flex-1" style={{ color: 'var(--t)' }}>{bank.name}</span>
                    <span className="text-sm font-bold font-mono" style={{ color: 'var(--bl)' }}>
                      R$ {bank.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => { if (confirm(`Remover ${bank.name}?`)) { deleteBank(bank.id); toastFn('Banco removido', 'ok'); } }}
                      className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                      style={{ color: 'var(--r)' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab: Clones Bets ── */}
      {tab === 'clones' && (
        <div className="flex flex-col gap-5">
          {/* Stats chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Grupos', value: CLONE_GROUPS.length },
              { label: 'Total clones', value: CLONE_GROUPS.reduce((s, g) => s + g.clones.length, 0) },
              { label: 'Independentes', value: SEM_CLONE.length },
            ].map(c => (
              <span key={c.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'var(--sur)', border: '1px solid var(--b)', color: 'var(--t2)' }}>
                <span className="font-bold" style={{ color: 'var(--t)' }}>{c.value}</span>
                {c.label}
              </span>
            ))}
            {/* Search */}
            <div className="relative flex-1 min-w-48 max-w-sm ml-auto">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
              <input value={cloneSearch} onChange={e => setCloneSearch(e.target.value)}
                placeholder="Buscar casa ou clone..."
                className="w-full pl-8 pr-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--sur)', border: '1px solid var(--b)', color: 'var(--t)' }} />
            </div>
          </div>

          {/* Groups with clones */}
          <div>
            <div className="text-xs font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--t3)' }}>
              <GitBranch size={12} />
              Casas com Clones
              <span className="px-1.5 py-0.5 rounded-full text-xs"
                style={{ background: 'var(--sur)', color: 'var(--t3)' }}>
                {filteredGroups.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {filteredGroups.map(g => (
                <CloneGroupCard
                  key={g.principal.name}
                  group={g}
                  open={openCloneId === g.principal.name}
                  onToggle={() => setOpenCloneId(prev => prev === g.principal.name ? null : g.principal.name)}
                />
              ))}
            </div>
          </div>

          {/* Houses without clones */}
          {filteredSemClone.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--t3)' }}>
                <Building2 size={12} />
                Casas Independentes
                <span className="px-1.5 py-0.5 rounded-full text-xs"
                  style={{ background: 'var(--sur)', color: 'var(--t3)' }}>
                  {filteredSemClone.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-1.5">
                {filteredSemClone.map(h => (
                  <a
                    key={h.name}
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--b)', color: 'var(--t2)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)'; }}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,.05)' }}>
                      <FavIcon logo={h.logo} name={h.name} size={14} />
                    </div>
                    <span className="text-xs truncate">{h.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCatalog && <CatalogModal onSelect={handleCatalogSelect} onClose={() => setShowCatalog(false)} />}
      {showForm && (
        <BMForm existing={editing} presetName={presetName} presetColor={presetColor}
          onClose={() => { setShowForm(false); setEditing(undefined); }} />
      )}
      {showBankForm && <BankForm onClose={() => setShowBankForm(false)} />}
    </div>
  );
}
