export const oddsPlugin = {
  id:            'odds-1x2',
  name:          'Odds 1x2',
  match:         /get-individual-odds.*market=1x2(?!_pa)/,
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
        row_id: `${r.match_id}__${r.bookmaker_slug}`,
      }));
  },
};
