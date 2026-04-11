/**
 * resultMapper.ts
 * Normalises various text representations of bet results into canonical types.
 */

import type { ResultType } from '@/types';

const GREEN_TOKENS    = ['green', 'ganhou', 'win', 'won', 'g', '✓', 'acertou'];
const RED_TOKENS      = ['red', 'perdeu', 'loss', 'lost', 'r', '✗', 'errou'];
const HALF_G_TOKENS   = ['meio green', 'half win', 'halfgreen', 'mg', '½ green', 'half green'];
const HALF_R_TOKENS   = ['meio red', 'half loss', 'halfred', 'mr', '½ red', 'half red'];
const VOID_TOKENS     = ['devolvido', 'void', 'reembolso', 'push', 'cancelado', 'cancelada', 'devolução'];
const CASHOUT_TOKENS  = ['cashout', 'cash out', 'co'];

export function mapResult(value: unknown): ResultType {
  if (value === undefined || value === null) return 'Pendente';
  const s = String(value).trim().toLowerCase();
  if (!s) return 'Pendente';

  if (CASHOUT_TOKENS.some(t => s === t))       return 'Cashout';
  if (HALF_G_TOKENS.some(t => s.includes(t)))  return 'Meio Green';
  if (HALF_R_TOKENS.some(t => s.includes(t)))  return 'Meio Red';
  if (GREEN_TOKENS.some(t => s === t || s.startsWith(t))) return 'Green';
  if (RED_TOKENS.some(t => s === t || s.startsWith(t)))   return 'Red';
  if (VOID_TOKENS.some(t => s.includes(t)))    return 'Devolvido';

  return 'Pendente';
}

export const RESULT_LABELS: Record<ResultType, string> = {
  Green:                  'Green',
  Red:                    'Red',
  'Meio Green':           'Meio Green',
  'Meio Red':             'Meio Red',
  Devolvido:              'Devolvido',
  Cashout:                'Cashout',
  'Green Antecipado':     'Green Antecipado',
  Pendente:               'Pendente',
};

export const RESULT_COLORS: Record<ResultType, string> = {
  Green:                  '#3DFF8F',
  Red:                    '#FF4545',
  'Meio Green':           '#FFCB2F',
  'Meio Red':             '#FF8F3D',
  Devolvido:              '#4DA6FF',
  Cashout:                '#FFBF00',
  'Green Antecipado':     '#FFCB2F',
  Pendente:               '#7A90B0',
};
