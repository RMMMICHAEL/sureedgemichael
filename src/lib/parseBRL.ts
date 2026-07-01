/** Converte valor digitado em formato BR (1.234,56 / 1.234 / 1234,56 / 1234) para número */
export function parseBRLInput(raw: string): number {
  const s = raw.trim();
  const hasDot   = s.includes('.');
  const hasComma = s.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    // 1.234,56 → remove . e troca , por .
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (hasDot && !hasComma) {
    // 1.234 ou 1.50 → se 3 dígitos após o ponto = milhar, senão decimal
    const afterDot = s.slice(s.lastIndexOf('.') + 1);
    normalized = afterDot.length === 3 ? s.replace(/\./g, '') : s;
  } else if (hasComma && !hasDot) {
    // 1,50 ou 1,500 → se 3 dígitos após vírgula = milhar, senão decimal
    const afterComma = s.slice(s.lastIndexOf(',') + 1);
    normalized = afterComma.length === 3 ? s.replace(',', '') : s.replace(',', '.');
  } else {
    normalized = s;
  }
  return parseFloat(normalized);
}
