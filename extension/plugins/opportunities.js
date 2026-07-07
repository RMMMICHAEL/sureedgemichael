export const opportunitiesPlugin = {
  id:            'opportunities',
  name:          'Oportunidades DG',
  match:         /get-dg-opportunities/,
  protocol:      'any',
  priority:      'high',
  diffKey:       'id',
  schemaVersion: 1,
  // Não tem handler de DB no ingest — salva snapshot local e não enfileira
  skipIngest:    true,
  expectedSchema: {
    id:          'string',
    home_team:   'string',
    away_team:   'string',
    profit_pct:  'number',
  },

  parse(body) {
    const rows = Array.isArray(body) ? body : (body?.data ?? body?.opportunities ?? []);
    return rows.filter(r => r && r.id);
  },
};
