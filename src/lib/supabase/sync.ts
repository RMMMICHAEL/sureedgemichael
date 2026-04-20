/**
 * sync.ts
 * Loads and saves the entire AppDB as a single JSON blob in Supabase.
 * Falls back gracefully if the user is not logged in or offline.
 */

import { getSupabaseClient } from './client';
import type { AppDB } from '@/types';

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadFromSupabase(): Promise<AppDB | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_data')
      .select('data')
      .eq('user_id', user.id)
      .single();

    if (error || !data) return null;
    return data.data as AppDB;
  } catch {
    return null;
  }
}

// ── Save (upsert) ─────────────────────────────────────────────────────────────

export async function saveToSupabase(db: AppDB): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Usuário não autenticado' };

    const { error } = await supabase
      .from('user_data')
      .upsert({ user_id: user.id, data: db }, { onConflict: 'user_id' });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Erro desconhecido' };
  }
}

// ── Debounced save ────────────────────────────────────────────────────────────

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveToSupabase(db: AppDB, delayMs = 2000): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveToSupabase(db), delayMs);
}

// ── Load Supabase profile ──────────────────────────────────────────────────────

export async function getSupabaseUser() {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}
