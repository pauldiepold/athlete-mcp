import { describe, it, expect } from 'vitest'
import { isOperator, OPERATOR_GITHUB_LOGINS } from './isOperator'

describe('isOperator', () => {
  it('lässt die allowlistete Betreiber-Identität durch', () => {
    expect(isOperator('pauldiepold')).toBe(true)
  })

  it('weist jede andere GitHub-Identität ab', () => {
    expect(isOperator('octocat')).toBe(false)
    expect(isOperator('paul')).toBe(false)
  })

  it('vergleicht case-insensitiv (GitHub-Logins sind es)', () => {
    expect(isOperator('PaulDiepold')).toBe(true)
    expect(isOperator('PAULDIEPOLD')).toBe(true)
  })

  it('trimmt Whitespace', () => {
    expect(isOperator('  pauldiepold  ')).toBe(true)
  })

  it('weist Leeres/Fehlendes ab', () => {
    expect(isOperator('')).toBe(false)
    expect(isOperator('   ')).toBe(false)
    expect(isOperator(null)).toBe(false)
    expect(isOperator(undefined)).toBe(false)
  })

  it('nutzt die übergebene Allowlist', () => {
    expect(isOperator('alice', ['alice', 'bob'])).toBe(true)
    expect(isOperator('pauldiepold', ['alice'])).toBe(false)
  })

  it('exportiert pauldiepold als einzigen Default-Operator', () => {
    expect(OPERATOR_GITHUB_LOGINS).toEqual(['pauldiepold'])
  })
})
