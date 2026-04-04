'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button }  from '@/components/ui/Button';
import { bmColor, bmAbbr } from '@/lib/finance/reconciler';
import { parseSheetUrl, syncFromSheet } from '@/lib/import/sheetsSync';
import {
  Building2, Plus, Trash2, FileSpreadsheet,
  ChevronRight, CheckCircle2, AlertTriangle, Link2, RefreshCw,
} from 'lucide-react';

// ── Step 1: Connect Google Sheet ────────────────────────────────────────────

function StepSheet({ onNext }: { onNext: () => void }) {
  const setSheetSync  = useStore(s => s.setSheetSync);
  const setImportBuf  = useStore(s => s.setImportBuffer);
  const setSyncing    = useStore(s => s.setSyncing);
  const isSyncing     = useStore(s => s.isSyncing);
  const sheetSync     = useStore(s => s.sheetSync);
  const toastFn       = useStore(s => s.toast);

  const [url, setUrl]       = useState(sheetSync?.url ?? '');
  const [synced, setSynced] = useState(false);

  async function handleConnect() {
    if (!url.trim()) { toastFn('Cole o link da planilha.', 'wrn'); return; }
    const parsed = parseSheetUrl(url.trim());
    if (!parsed) { toastFn('URL inválida. Cole o link do Google Sheets.', 'err'); return; }

    const cfg = {
      url: url.trim(),
      sheetId: parsed.sheetId,
      gid: parsed.gid,
      lastSync: '',
      autoSync: false,
      intervalMin: 0,
    };

    setSyncing(true);
    try {
      const result = await syncFromSheet(cfg);          // no filter → full history
      setSheetSync({ ...cfg, lastSync: new Date().toISOString(), historyImported: true });
      setImportBuf(result);
      setSynced(true);
      toastFn(`Planilha conectada — ${result.rows.length} linhas encontradas`, 'ok');
    } catch (err: unknown) {
      toastFn((err as Error).message, 'err');
    } finally {
      setSyncing(false);
    }
  }

  const inputStyle = {
    background: 'var(--sur)',
    border: '1px solid var(--b2)',
    color: 'var(--t)',
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Info box */}
      <div
        className="rounded-xl p-4 flex gap-3"
        style={{ background: 'rgba(77,166,255,.07)', border: '1px solid rgba(77,166,255,.2)' }}
      >
        <FileSpreadsheet size={18} style={{ color: 'var(--bl)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--t)' }}>
            Conecte sua planilha Google Sheets
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
            Cole o link da sua planilha abaixo. O SureEdge irá ler as operações
            automaticamente e importar para o painel. Certifique-se de que a planilha
            está compartilhada publicamente (ou com permissão de leitura).
          </p>
        </div>
      </div>

      {/* URL input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold" style={{ color: 'var(--t3)' }}>
          LINK DA PLANILHA (Google Sheets)
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={e => { setUrl(e.target.value); setSynced(false); }}
            onKeyDown={e => e.key === 'Enter' && handleConnect()}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <button
            onClick={handleConnect}
            disabled={isSyncing || !url.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold flex-shrink-0 transition-all disabled:opacity-40"
            style={{ background: synced ? 'var(--gd)' : 'var(--g)', color: synced ? 'var(--g)' : 'var(--bg)', border: synced ? '1px solid var(--gb)' : 'none' }}
          >
            {isSyncing
              ? <RefreshCw size={14} className="animate-spin" />
              : synced
                ? <CheckCircle2 size={14} />
                : <Link2 size={14} />}
            {isSyncing ? 'Conectando...' : synced ? 'Conectado' : 'Conectar'}
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--t3)' }}>
          Como obter o link: Abra a planilha → Compartilhar → Copiar link
        </p>
      </div>

      {/* Warning box */}
      <div
        className="rounded-xl p-4 flex gap-3"
        style={{ background: 'rgba(255,203,47,.07)', border: '1px solid rgba(255,203,47,.25)' }}
      >
        <AlertTriangle size={16} style={{ color: 'var(--y)', flexShrink: 0, marginTop: 2 }} />
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold" style={{ color: 'var(--y)' }}>
            Atenção: precisão dos dados importados
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
            Alguns dados podem vir <strong>incorretos</strong> caso a planilha tenha sido
            editada ou formatada de forma não padronizada (células mescladas, fórmulas,
            colunas renomeadas, etc.).
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
            Para dados incorretos, recomendamos <strong>registrar manualmente</strong> pela
            aba <strong>Operações</strong> após o onboarding.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-3 pt-2" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost" onClick={onNext}>
          Pular por agora
        </Button>
        <Button variant="primary" onClick={onNext} disabled={!synced && !sheetSync?.url}>
          Continuar <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Add bookmakers (optional) ───────────────────────────────────────

interface BMEntry {
  name: string;
  initial_balance: string;
}

function StepBookmakers({ onFinish }: { onFinish: () => void }) {
  const addBookmaker = useStore(s => s.addBookmaker);
  const toastFn      = useStore(s => s.toast);

  const [entries, setEntries] = useState<BMEntry[]>([{ name: '', initial_balance: '' }]);

  function addRow() {
    setEntries(e => [...e, { name: '', initial_balance: '' }]);
  }

  function removeRow(i: number) {
    setEntries(e => e.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, field: keyof BMEntry, value: string) {
    setEntries(e => e.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function handleSave() {
    const valid = entries.filter(e => e.name.trim());
    if (valid.length) {
      valid.forEach(e => {
        addBookmaker({
          name:            e.name.trim(),
          abbr:            bmAbbr(e.name.trim()),
          color:           bmColor(e.name.trim()),
          initial_balance: parseFloat(e.initial_balance.replace(',', '.')) || 0,
          status:          'ativa',
          notes:           '',
        });
      });
      toastFn(`${valid.length} casa(s) cadastrada(s).`, 'ok');
    }
    onFinish();
  }

  const inputStyle = {
    background: 'var(--sur)',
    border: '1px solid var(--b2)',
    color: 'var(--t)',
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Info box */}
      <div
        className="rounded-xl p-4 flex gap-3"
        style={{ background: 'rgba(61,255,143,.06)', border: '1px solid rgba(61,255,143,.15)' }}
      >
        <Building2 size={18} style={{ color: 'var(--g)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--t)' }}>
            Cadastre suas casas de aposta (opcional)
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--t2)' }}>
            Informe as casas que você usa e o saldo atual de cada uma.
            Isso permite acompanhar o caixa e a movimentação por casa.
            Você pode fazer isso agora ou mais tarde em <strong>Casas de Aposta</strong>.
          </p>
        </div>
      </div>

      {/* Table of entries */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_140px_36px] gap-2 text-xs font-bold px-1" style={{ color: 'var(--t3)' }}>
          <span>CASA DE APOSTA</span>
          <span>SALDO INICIAL (R$)</span>
          <span />
        </div>

        {entries.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_36px] gap-2 items-center">
            <input
              value={row.name}
              onChange={e => updateRow(i, 'name', e.target.value)}
              placeholder="Ex: Bet365, Betano..."
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
            <input
              value={row.initial_balance}
              onChange={e => updateRow(i, 'initial_balance', e.target.value)}
              placeholder="0,00"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono outline-none"
              style={inputStyle}
            />
            <button
              onClick={() => removeRow(i)}
              disabled={entries.length === 1}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: 'var(--rd)', color: 'var(--r)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <button
          onClick={addRow}
          className="flex items-center gap-2 text-sm font-medium mt-1 px-1 transition-opacity hover:opacity-70"
          style={{ color: 'var(--g)' }}
        >
          <Plus size={14} /> Adicionar outra casa
        </button>
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-3 pt-2" style={{ borderTop: '1px solid var(--b)' }}>
        <Button variant="ghost" onClick={onFinish}>
          Pular
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Concluir configuração <CheckCircle2 size={14} />
        </Button>
      </div>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function OnboardingModal() {
  const [step, setStep]  = useState<1 | 2>(1);
  const finishOnboarding = useStore(s => s.finishOnboarding);
  const completeStep     = useStore(s => s.completeOnboardingStep);

  function goToStep2() {
    completeStep('import_choice');
    setStep(2);
  }

  const STEP_TITLES = {
    1: 'Bem-vindo ao SureEdge — Conecte sua planilha',
    2: 'Casas de aposta',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.80)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-xl animate-slide-up rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg3)', border: '1px solid var(--b2)' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid var(--b)' }}>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-3">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: s <= step ? 'var(--g)' : 'var(--sur)',
                    color:      s <= step ? 'var(--bg)' : 'var(--t3)',
                  }}
                >
                  {s < step ? <CheckCircle2 size={14} /> : s}
                </div>
                {s < 2 && (
                  <div
                    className="w-8 h-0.5 rounded"
                    style={{ background: s < step ? 'var(--g)' : 'var(--b2)' }}
                  />
                )}
              </div>
            ))}
            <span className="ml-2 text-xs" style={{ color: 'var(--t3)' }}>
              Passo {step} de 2
            </span>
          </div>
          <h2 className="text-base font-bold" style={{ color: 'var(--t)' }}>
            {STEP_TITLES[step]}
          </h2>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {step === 1 && <StepSheet onNext={goToStep2} />}
          {step === 2 && <StepBookmakers onFinish={finishOnboarding} />}
        </div>
      </div>
    </div>
  );
}
