export const opportunitiesPlugin = {
  id:            'opportunities',
  name:          'Oportunidades DG',
  match:         /get-dg-opportunities/,
  protocol:      'any',
  priority:      'high',
  diffKey:       'id',
  schemaVersion: 1,
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
