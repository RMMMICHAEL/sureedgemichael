/**
 * surebetEngine.ts
 * Pure-math engine for the surebet calculator.
 * No React dependencies — all functions are pure TypeScript.
 */

export type Matrix = number[][];

export interface CalcResult {
  stakes: number[];       // stake for each outcome
  profits: number[];      // net profit for each outcome if it wins
  totalBet: number;       // sum of all active stakes
  profitPct: number;      // min profit / totalBet * 100
  margin: number;         // sum of 1/odd_i (simple formula) or 0 for complex
  isSurebet: boolean;     // true when profitPct > 0
}

// ── Formula functions (matrix payoff per unit stake) ─────────────────────────
// matrix[outcome][bet] = net payoff coefficient when `outcome` occurs
// e.g. own stake wins: odd-1  |  other stake loses: -1  |  push: 0  |  half-win: (odd-1)/2

const F: Record<string, (t: number, n: number, i: number) => Matrix> = {
  bookformula1:  (t, n)    => [[t-1,-1],            [-1,n-1]],
  bookformula2:  (t, n, i) => [[t-1,-1,-1],         [-1,n-1,-1],          [-1,-1,i-1]],
  bookformula3:  (t, n, i) => [[t-1,-1,-1],         [0,n-1,-1],           [-1,-1,i-1]],
  bookformula4:  (t, n, i) => [[t-1,-1,-1],         [0,n-1,-1],           [-1,n-1,i-1]],
  bookformula5:  (t, n, i) => [[t-1,-1,-1],         [-0.5,n-1,-1],        [-1,-1,i-1]],
  bookformula6:  (t, n, i) => [[t-1,-1,-1],         [-0.5,n-1,-1],        [-1,n-1,i-1]],
  bookformula7:  (t, n, i) => [[t-1,-1,-1],         [(t-1)/2,n-1,-1],     [-1,-1,i-1]],
  bookformula8:  (t, n, i) => [[t-1,-1,-1],         [(t-1)/2,n-1,-1],     [-1,n-1,i-1]],
  bookformula9:  (t, n, i) => [[t-1,-1,-1],         [-0.5,n-1,0],         [-1,-1,i-1]],
  bookformula10: (t, n, i) => [[t-1,-1,-1],         [-0.5,n-1,0],         [-1,n-1,i-1]],
  bookformula11: (t, n, i) => [[t-1,-1,-1],         [-0.5,n-1,-0.5],      [-1,-1,i-1]],
  bookformula12: (t, n, i) => [[t-1,-1,-1],         [-0.5,n-1,-0.5],      [-1,-1,i-1]],
  bookformula13: (t, n, i) => [[t-1,-1,-1],         [0,(n-1)/2,-1],       [-1,n-1,i-1]],
  bookformula14: (t, n, i) => [[t-1,-1,-1],         [0,n-1,-0.5],         [-1,n-1,i-1]],
  bookformula15: (t, n, i) => [[t-1,-1,-1],         [(t-1)/2,0,-1],       [-1,n-1,i-1]],
  bookformula16: (t, n, i) => [[t-1,n-1,-1],        [t-1,-1,i-1],         [-1,n-1,i-1]],
  bookformula17: (t, n, i) => [[t-1,n-1,-1],        [(t-1)/2,-1,i-1],     [-1,n-1,i-1]],
  bookformula18: (t, n, i) => [[t-1,n-1,-1],        [(t-1)/2,-1,(i-1)/2], [-1,n-1,i-1]],
  bookformula19: (t, n, i) => [[t-1,n-1,-1],        [0,-1,i-1],           [-1,n-1,i-1]],
  bookformula20: (t, n, i) => [[t-1,n-1,-1],        [0,-1,(i-1)/2],       [-1,n-1,i-1]],
  bookformula21: (t, n, i) => [[t-1,-1,-1],         [(t-1)/2,(n-1)/2,-1], [-1,n-1,i-1]],
};

export function getMatrix(formulaKey: string, odds: number[]): Matrix {
  const fn = F[formulaKey];
  if (!fn) return [[1,-1],[-1,1]];
  return fn(odds[0] ?? 2, odds[1] ?? 2, odds[2] ?? 2);
}

// ── Formula options ───────────────────────────────────────────────────────────

export interface FormulaOption {
  value:    number;
  formula:  string;
  labels:   string[];
  display:  string;
}

export const FORMULA_OPTIONS_2WAY: FormulaOption[] = [
  { value: 0, formula: 'bookformula1', labels: ['1','2'],         display: '1 − 2'         },
  { value: 1, formula: 'bookformula1', labels: ['1','X2'],        display: '1 − X2'        },
  { value: 2, formula: 'bookformula1', labels: ['1X','2'],        display: '1X − 2'        },
  { value: 3, formula: 'bookformula1', labels: ['H1()','H2()'],   display: 'H1() − H2()'   },
  { value: 4, formula: 'bookformula1', labels: ['Acima','Abaixo'],display: 'Acima − Abaixo'},
];

export const FORMULA_OPTIONS_3WAY: FormulaOption[] = [
  { value:  5, formula:'bookformula2',  labels:['1','X','2'],                      display:'1 − X − 2'                          },
  { value:  6, formula:'bookformula3',  labels:['H1(0)','X','2'],                  display:'H1(0) − X − 2'                      },
  { value:  7, formula:'bookformula3',  labels:['H2(0)','X','1'],                  display:'H2(0) − X − 1'                      },
  { value:  8, formula:'bookformula4',  labels:['H1(0)','X2','2'],                 display:'H1(0) − X2 − 2'                     },
  { value:  9, formula:'bookformula4',  labels:['H2(0)','1X','1'],                 display:'H2(0) − 1X − 1'                     },
  { value: 10, formula:'bookformula4',  labels:['Acima 2','Abaixo 2.5','Abaixo 1.5'],display:'Acima 2 − Abaixo 2.5 − Abaixo 1.5'},
  { value: 11, formula:'bookformula4',  labels:['Abaixo 2','Acima 1.5','Acima 2.5'],display:'Abaixo 2 − Acima 1.5 − Acima 2.5' },
  { value: 12, formula:'bookformula5',  labels:['H1(−0.25)','X','2'],              display:'H1(−0.25) − X − 2'                  },
  { value: 13, formula:'bookformula5',  labels:['H2(−0.25)','X','1'],              display:'H2(−0.25) − X − 1'                  },
  { value: 14, formula:'bookformula6',  labels:['H1(−0.25)','X2','2'],             display:'H1(−0.25) − X2 − 2'                 },
  { value: 15, formula:'bookformula6',  labels:['H2(−0.25)','1X','1'],             display:'H2(−0.25) − 1X − 1'                 },
  { value: 16, formula:'bookformula6',  labels:['Acima 2.25','Abaixo 2.5','Abaixo 1.5'],display:'Acima 2.25 − Abaixo 2.5 − Abaixo 1.5'},
  { value: 17, formula:'bookformula6',  labels:['Abaixo 1.75','Acima 1.5','Acima 2.5'],display:'Abaixo 1.75 − Acima 1.5 − Acima 2.5' },
  { value: 18, formula:'bookformula7',  labels:['H1(+0.25)','X','2'],              display:'H1(+0.25) − X − 2'                  },
  { value: 19, formula:'bookformula7',  labels:['H2(+0.25)','X','1'],              display:'H2(+0.25) − X − 1'                  },
  { value: 20, formula:'bookformula8',  labels:['H1(+0.25)','X2','2'],             display:'H1(+0.25) − X2 − 2'                 },
  { value: 21, formula:'bookformula8',  labels:['H2(+0.25)','1X','1'],             display:'H2(+0.25) − 1X − 1'                 },
  { value: 22, formula:'bookformula8',  labels:['Acima 1.75','Abaixo 2.5','Abaixo 1.5'],display:'Acima 1.75 − Abaixo 2.5 − Abaixo 1.5'},
  { value: 23, formula:'bookformula8',  labels:['Abaixo 2.25','Acima 1.5','Acima 2.5'],display:'Abaixo 2.25 − Acima 1.5 − Acima 2.5'},
  { value: 24, formula:'bookformula9',  labels:['H1(−0.25)','X','H2(0)'],          display:'H1(−0.25) − X − H2(0)'              },
  { value: 25, formula:'bookformula9',  labels:['H2(−0.25)','X','H1(0)'],          display:'H2(−0.25) − X − H1(0)'              },
  { value: 26, formula:'bookformula10', labels:['H1(−0.25)','X2','H2(0)'],         display:'H1(−0.25) − X2 − H2(0)'             },
  { value: 27, formula:'bookformula10', labels:['H2(−0.25)','1X','H1(0)'],         display:'H2(−0.25) − 1X − H1(0)'             },
  { value: 28, formula:'bookformula10', labels:['Acima 1.75','Abaixo 1.5','Abaixo 2'],display:'Acima 1.75 − Abaixo 1.5 − Abaixo 2'},
  { value: 29, formula:'bookformula11', labels:['H1(−0.25)','X','H2(−0.25)'],      display:'H1(−0.25) − X − H2(−0.25)'          },
  { value: 30, formula:'bookformula12', labels:['H1(−0.25)','X2','H2(−0.25)'],     display:'H1(−0.25) − X2 − H2(−0.25)'         },
  { value: 31, formula:'bookformula12', labels:['H2(−0.25)','1X','H1(−0.25)'],     display:'H2(−0.25) − 1X − H1(−0.25)'         },
  { value: 32, formula:'bookformula12', labels:['Acima 2.25','Abaixo 2.5','Abaixo 1.75'],display:'Acima 2.25 − Abaixo 2.5 − Abaixo 1.75'},
  { value: 33, formula:'bookformula13', labels:['H1(0)','H2(+0.25)','2'],          display:'H1(0) − H2(+0.25) − 2'              },
  { value: 34, formula:'bookformula13', labels:['H2(0)','H1(+0.25)','1'],          display:'H2(0) − H1(+0.25) − 1'              },
  { value: 35, formula:'bookformula13', labels:['Acima 2','Abaixo 2.25','Abaixo 1.5'],display:'Acima 2 − Abaixo 2.25 − Abaixo 1.5'},
  { value: 36, formula:'bookformula13', labels:['Abaixo 2','Acima 1.75','Acima 2.5'],display:'Abaixo 2 − Acima 1.75 − Acima 2.5' },
  { value: 37, formula:'bookformula14', labels:['H1(0)','X2','H2(−0.25)'],         display:'H1(0) − X2 − H2(−0.25)'             },
  { value: 38, formula:'bookformula14', labels:['H2(0)','1X','H1(−0.25)'],         display:'H2(0) − 1X − H1(−0.25)'             },
  { value: 39, formula:'bookformula14', labels:['Acima 2','Abaixo 2.5','Abaixo 1.75'],display:'Acima 2 − Abaixo 2.5 − Abaixo 1.75'},
  { value: 40, formula:'bookformula14', labels:['Abaixo 2','Acima 1.5','Acima 2.25'],display:'Abaixo 2 − Acima 1.5 − Acima 2.25' },
  { value: 41, formula:'bookformula15', labels:['H1(+0.25)','H2(0)','2'],          display:'H1(+0.25) − H2(0) − 2'              },
  { value: 42, formula:'bookformula15', labels:['H2(+0.25)','H1(0)','1'],          display:'H2(+0.25) − H1(0) − 1'              },
  { value: 43, formula:'bookformula15', labels:['Acima 1.75','Abaixo 2','Abaixo 1.5'],display:'Acima 1.75 − Abaixo 2 − Abaixo 1.5'},
  { value: 44, formula:'bookformula16', labels:['1X','12','X2'],                   display:'1X − 12 − X2 (dupla chance)'        },
  { value: 45, formula:'bookformula17', labels:['H1(+0.25)','12','X2'],            display:'H1(+0.25) − 12 − X2'                },
  { value: 46, formula:'bookformula17', labels:['H2(+0.25)','12','1X'],            display:'H2(+0.25) − 12 − 1X'                },
  { value: 47, formula:'bookformula18', labels:['H1(+0.25)','12','H2(+0.25)'],     display:'H1(+0.25) − 12 − H2(+0.25)'         },
  { value: 48, formula:'bookformula19', labels:['H1(0)','12','X2'],                display:'H1(0) − 12 − X2'                    },
  { value: 49, formula:'bookformula19', labels:['H2(0)','12','1X'],                display:'H2(0) − 12 − 1X'                    },
  { value: 50, formula:'bookformula20', labels:['H1(0)','12','H2(+0.25)'],         display:'H1(0) − 12 − H2(+0.25)'             },
  { value: 51, formula:'bookformula20', labels:['H2(0)','12','H1(+0.25)'],         display:'H2(0) − 12 − H1(+0.25)'             },
  { value: 52, formula:'bookformula21', labels:['Abaixo 2.25','Acima 1.75','Acima 2.5'],display:'Abaixo 2.25 − Acima 1.75 − Acima 2.5'},
];

// ── Gaussian–Jordan elimination ───────────────────────────────────────────────
// Solves A * x = b where A is square, returns x. Returns zeros on failure.

function gaussJordan(A: number[][]): number[] {
  const n = A.length;
  const M = A.map(row => [...row]); // deep copy

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const piv = M[col][col];
    if (Math.abs(piv) < 1e-12) continue;

    // Eliminate all other rows
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col] / piv;
      for (let k = col; k < M[0].length; k++) {
        M[row][k] -= f * M[col][k];
      }
    }
  }

  return M.map((row, i) =>
    Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]
  );
}

// ── Profit per scenario ───────────────────────────────────────────────────────

function calcProfits(stakes: number[], matrix: Matrix): number[] {
  return matrix.map(row =>
    row.reduce((sum, coeff, i) => sum + coeff * (stakes[i] ?? 0), 0)
  );
}

// ── Main calculate ────────────────────────────────────────────────────────────

export function calculate(
  odds:        number[],         // e.g. [2.1, 1.95] or [2.5, 3.1, 2.8]
  formulaKey:  string,           // e.g. 'bookformula2'
  anchor:      number,           // total bet (fixedIdx='sum') OR fixed stake value (fixedIdx=0..n-1)
  fixedIdx:    number | 'sum',   // 'sum' = fix total; 0/1/2 = fix that row's stake
  distribute:  boolean[],        // which outcomes participate in equalization
  roundTo:     number | null,    // round each free stake to nearest multiple
): CalcResult {
  const n = odds.length;
  const matrix = getMatrix(formulaKey, odds);

  // Active outcomes: those with distribute=true
  const activeIdxs = distribute
    .map((d, i) => (d ? i : -1))
    .filter(i => i >= 0);

  const empty: CalcResult = {
    stakes: Array(n).fill(0),
    profits: Array(n).fill(0),
    totalBet: 0, profitPct: 0, margin: 0, isSurebet: false,
  };

  if (activeIdxs.length < 2) return empty;

  try {
    let stakes = Array(n).fill(0);

    if (fixedIdx === 'sum') {
      // ── System: [subMatrix | -1 | 0] for each active outcome
      //            [1 1 ... 1 |  0 | total] for sum constraint
      // Unknowns: active stakes + P
      const na = activeIdxs.length;
      const subMat = activeIdxs.map(j => activeIdxs.map(k => matrix[j][k]));
      const aug: number[][] = subMat.map(row => [...row, -1, 0]);
      aug.push([...Array(na).fill(1), 0, anchor]);

      const sol = gaussJordan(aug);
      activeIdxs.forEach((origIdx, i) => { stakes[origIdx] = sol[i]; });

    } else {
      // ── Fix stake[fixedIdx] = anchor, solve for the rest
      // Map fixedIdx (0/1/2) → original index
      const fixedOrig = activeIdxs[fixedIdx] ?? activeIdxs[0];
      const freeIdxs  = activeIdxs.filter(i => i !== fixedOrig);
      const na        = activeIdxs.length;

      // For each active outcome j:
      // sum_{k in freeIdxs}(matrix[j][k] * s_k) - P = -matrix[j][fixedOrig] * anchor
      const aug: number[][] = activeIdxs.map(j => {
        const origJ = j;
        const row   = freeIdxs.map(k => matrix[origJ][k]);
        row.push(-1);                                         // coefficient for P
        row.push(-matrix[origJ][fixedOrig] * anchor);        // RHS
        return row;
      });

      const sol     = gaussJordan(aug);
      stakes[fixedOrig] = anchor;
      freeIdxs.forEach((fi, idx) => { stakes[fi] = sol[idx]; });
    }

    // Apply rounding
    if (roundTo && roundTo > 0) {
      if (fixedIdx === 'sum') {
        // ── Largest-remainder method: round all stakes down, then distribute
        // the remaining units to stakes with the biggest fractional parts.
        // This guarantees sum(rounded stakes) == anchor exactly
        // (when anchor is a multiple of roundTo; otherwise within ±roundTo/2).
        const floors    = activeIdxs.map(i => Math.floor(stakes[i] / roundTo) * roundTo);
        const fractions = activeIdxs.map((i, j) => stakes[i] - floors[j]);
        const sumFloors = floors.reduce((a, b) => a + b, 0);
        // Number of roundTo-units to redistribute to recover the deficit
        const extraUnits = Math.round((anchor - sumFloors) / roundTo);
        // Give extra units to the stakes with the largest fractional remainders
        const order = fractions
          .map((rem, j) => ({ j, rem }))
          .sort((a, b) => b.rem - a.rem);
        const extras = new Array(activeIdxs.length).fill(0);
        for (let k = 0; k < extraUnits && k < order.length; k++) {
          extras[order[k].j] = roundTo;
        }
        activeIdxs.forEach((origIdx, j) => {
          stakes[origIdx] = floors[j] + extras[j];
        });
      } else {
        // Fixed-stake mode: only round the free stakes (fixed stake stays as-is)
        const fixedOrig = activeIdxs[fixedIdx as number] ?? activeIdxs[0];
        activeIdxs.forEach(i => {
          if (i === fixedOrig) return;
          stakes[i] = Math.round(stakes[i] / roundTo) * roundTo;
        });
      }
    }

    const profits    = calcProfits(stakes, matrix);
    const totalBet   = activeIdxs.reduce((s, i) => s + stakes[i], 0);
    const minProfit  = Math.min(...activeIdxs.map(i => profits[i]));
    const profitPct  = totalBet > 0.001 ? (minProfit / totalBet) * 100 : 0;

    // Simple margin (valid for diagonal formulas only — shown for reference)
    const margin = activeIdxs.reduce((s, i) => s + 1 / (odds[i] || 1), 0);

    return { stakes, profits, totalBet, profitPct, margin, isSurebet: minProfit > 1e-6 };

  } catch {
    return empty;
  }
}
