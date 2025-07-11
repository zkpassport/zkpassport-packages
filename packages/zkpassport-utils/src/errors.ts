export enum ZKPassportErrorType {
  VALIDATION = 'VALIDATION',
  CRYPTOGRAPHIC = 'CRYPTOGRAPHIC',
  DATA_STRUCTURE = 'DATA_STRUCTURE',
  MISSING_DATA = 'MISSING_DATA',
  ENVIRONMENT = 'ENVIRONMENT',
  CAPACITY = 'CAPACITY',
  STATE = 'STATE',
  UNKNOWN = 'UNKNOWN',
  PARSING = 'PARSING',
  CERTIFICATE = 'CERTIFICATE'
}

export enum ZKPassportErrorSubType {
  // Validation subtypes
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_TYPE = 'INVALID_TYPE',
  INVALID_VALUE = 'INVALID_VALUE',
  INVALID_LENGTH = 'INVALID_LENGTH',
  
  // Cryptographic subtypes
  UNKNOWN_ALGORITHM = 'UNKNOWN_ALGORITHM',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_CERTIFICATE = 'INVALID_CERTIFICATE',
  UNKNOWN_CURVE = 'UNKNOWN_CURVE',
  KEY_SIZE_MISMATCH = 'KEY_SIZE_MISMATCH',
  
  // Data structure subtypes
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  NOT_FOUND = 'NOT_FOUND',
  TREE_FULL = 'TREE_FULL',
  
  // Missing data subtypes
  MISSING_CERTIFICATE = 'MISSING_CERTIFICATE',
  MISSING_ATTRIBUTE = 'MISSING_ATTRIBUTE',
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  
  // Environment subtypes
  CRYPTO_NOT_AVAILABLE = 'CRYPTO_NOT_AVAILABLE',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  
  // Capacity subtypes
  SIZE_EXCEEDED = 'SIZE_EXCEEDED',
  CAPACITY_EXCEEDED = 'CAPACITY_EXCEEDED',
  
  // State subtypes
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  POOL_CLOSED = 'POOL_CLOSED'
}

export interface ZKPassportErrorContext {
  file?: string
  function?: string
  line?: number
  input?: any
  expected?: any
  actual?: any
  [key: string]: any
}

export class ZKPassportError extends Error {
  public errorType: ZKPassportErrorType
  public errorSubType?: ZKPassportErrorSubType
  public context?: ZKPassportErrorContext

  constructor(
    message: string,
    errorType: ZKPassportErrorType,
    errorSubType?: ZKPassportErrorSubType,
    context?: ZKPassportErrorContext
  ) {
    super(message)
    this.name = 'ZKPassportError'
    this.errorType = errorType
    this.errorSubType = errorSubType
    this.context = context
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ZKPassportError)
    }
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorType: this.errorType,
      errorSubType: this.errorSubType,
      context: this.context,
      stack: this.stack
    }
  }
}

// Specific error classes for better type safety and easier error handling

export class ValidationError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.VALIDATION, subType, context)
    this.name = 'ValidationError'
  }
}

export class CryptographicError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.CRYPTOGRAPHIC, subType, context)
    this.name = 'CryptographicError'
  }
}

export class DataStructureError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.DATA_STRUCTURE, subType, context)
    this.name = 'DataStructureError'
  }
}

export class MissingDataError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.MISSING_DATA, subType, context)
    this.name = 'MissingDataError'
  }
}

export class EnvironmentError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.ENVIRONMENT, subType, context)
    this.name = 'EnvironmentError'
  }
}

export class CapacityError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.CAPACITY, subType, context)
    this.name = 'CapacityError'
  }
}

export class StateError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.STATE, subType, context)
    this.name = 'StateError'
  }
}

export class ParsingError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.PARSING, subType, context)
    this.name = 'ParsingError'
  }
}

export class CertificateError extends ZKPassportError {
  constructor(message: string, subType: ZKPassportErrorSubType, context?: ZKPassportErrorContext) {
    super(message, ZKPassportErrorType.CERTIFICATE, subType, context)
    this.name = 'CertificateError'
  }
}

// Helper function to determine error type from legacy errors
export function wrapError(error: unknown, defaultType: ZKPassportErrorType = ZKPassportErrorType.UNKNOWN): ZKPassportError {
  if (error instanceof ZKPassportError) {
    return error
  }
  
  if (error instanceof Error) {
    return new ZKPassportError(error.message, defaultType, undefined, {
      originalError: error.name,
      stack: error.stack
    })
  }
  
  return new ZKPassportError(String(error), defaultType)
}