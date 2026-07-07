/**
 * Schema Validator — detecta mudanças no formato das respostas do DG.
 * Compara o schema real da resposta com o esperado pelo plugin.
 * 3 falhas consecutivas → alerta de schema mismatch.
 */

/** Extrai o schema (campos + tipos) de um array de objetos */
export function extractSchema(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return {};
  const sample = rows[0];
  const schema = {};
  for (const [k, v] of Object.entries(sample)) {
    schema[k] = Array.isArray(v) ? 'array' : typeof v;
  }
  return schema;
}

/** Compara schema real com schema esperado do plugin */
export function validateSchema(expected, actual) {
  const missingFields = [];
  const typeErrors    = [];

  for (const [field, expectedType] of Object.entries(expected)) {
    if (!(field in actual)) {
      missingFields.push(field);
    } else if (actual[field] !== expectedType) {
      typeErrors.push({ field, expected: expectedType, got: actual[field] });
    }
  }

  return {
    ok: missingFields.length === 0 && typeErrors.length === 0,
    missingFields,
    typeErrors,
  };
}

/** Hash simples do schema para comparação rápida */
export function schemaHash(schema) {
  return JSON.stringify(schema, Object.keys(schema).sort());
}

/**
 * Gerenciador de estado de validação por plugin.
 * Conta falhas consecutivas e dispara callback ao atingir threshold.
 */
export class SchemaMonitor {
  constructor(pluginId, expectedSchema, onAlert, threshold = 3) {
    this.pluginId       = pluginId;
    this.expectedSchema = expectedSchema;
    this.onAlert        = onAlert;
    this.threshold      = threshold;
    this.failures       = 0;
    this.lastRealSchema = null;
  }

  check(rows) {
    const actual = extractSchema(rows);
    const result = validateSchema(this.expectedSchema, actual);

    if (result.ok) {
      this.failures = 0;
      return true;
    }

    this.failures++;
    this.lastRealSchema = actual;

    if (this.failures >= this.threshold) {
      this.failures = 0; // reset para não spam
      this.onAlert({
        pluginId:       this.pluginId,
        expectedSchema: this.expectedSchema,
        receivedSchema: actual,
        missingFields:  result.missingFields,
        typeErrors:     result.typeErrors,
      });
    }

    return false;
  }
}
