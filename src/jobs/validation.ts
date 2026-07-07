import { logger } from "../logging/logger.js";

/**
 * Validation result for a single dataset.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a dataset before it is exported to the public directory.
 */
export function validatePublicDataset(type: string, data: any): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [] };

  if (!data) {
    result.valid = false;
    result.errors.push(`${type}: Data is null or undefined`);
    return result;
  }

  switch (type) {
    case "macro":
      validateMacro(data, result);
      break;
    case "margins":
      validateMargins(data, result);
      break;
    case "history":
    case "indexes":
    case "inflation":
      validateList(type, data, result);
      break;
  }

  if (!result.valid) {
    logger.error(`Validation failed for ${type}: ${result.errors.join(", ")}`);
  }

  return result;
}

function validateMacro(data: any, result: ValidationResult) {
  if (!data.latest) {
    result.valid = false;
    result.errors.push("macro: Missing latest metrics");
    return;
  }

  const l = data.latest;
  if (l.activeCompanies === 0 || l.companiesValue === 0) {
    result.valid = false;
    result.errors.push("macro: Active companies or value is zero");
  }
}

function validateMargins(data: any, result: ValidationResult) {
  if (!Array.isArray(data)) {
    result.valid = false;
    result.errors.push("margins: Expected an array");
    return;
  }

  if (data.length < 10) {
    result.valid = false;
    result.errors.push(`margins: Too few resources (${data.length})`);
  }

  const zeroPrices = data.filter((r: any) => r.vw === 0);
  if (zeroPrices.length > data.length * 0.3) {
    result.valid = false;
    result.errors.push(`margins: High percentage of zero prices (${zeroPrices.length}/${data.length})`);
  }
}

function validateList(type: string, data: any, result: ValidationResult) {
  if (!Array.isArray(data)) {
    result.valid = false;
    result.errors.push(`${type}: Expected an array`);
    return;
  }

  if (data.length === 0) {
    result.valid = false;
    result.errors.push(`${type}: Array is empty`);
  }
}
