import { IDCredential } from './credentials'

export type QueryResultValue = {
  eq?: {
    expected: any
    result: boolean
  }
  gte?: {
    expected: number | Date
    result: boolean
  }
  gt?: {
    expected: number | Date
    result: boolean
  }
  lte?: {
    expected: number | Date
    result: boolean
  }
  lt?: {
    expected: number | Date
    result: boolean
  }
  range?: {
    expected: [number | Date, number | Date]
    result: boolean
  }
  in?: {
    expected: any[]
    result: boolean
  }
  out?: {
    expected: any[]
    result: boolean
  }
  disclose?: {
    result: any
  }
}

export type QueryResult = {
  [key in IDCredential]?: QueryResultValue
}

export type ProofResult = {
  queryResult: QueryResult
  proof?: string
  verificationKey?: string
}
