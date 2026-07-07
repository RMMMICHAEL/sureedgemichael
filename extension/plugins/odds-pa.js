export const oddsPaPlugin = {
  id:            'odds-pa',
  name:          'Odds PA (Preço Aumentado)',
  match:         /get-individual-odds.*market=1x2_pa/,
  protocol:      'any',
  priority:      'critical',
  diffKey:       'row_id',
  schemaVersion: 1,
  expectedSchema: {
    match_id:       'string',
    home_team:      'string',
    away_team:      'string',
    bookmaker_slug: 'string',
    odd_home:       'number',
    odd_away:       'number',
  },

  parse(body) {
    const rows = Array.isArray(body) ? body : (body?.odds ?? body?.data ?? []);
    return rows
      .filter(r => r && r.match_id && r.bookmaker_slug)
      .map(r => ({
        ...r,
        market_type: '1x2_pa',
        row_id: `${r.match_id}__${r.bookmaker_slug}__pa`,
      }));
  },
};
