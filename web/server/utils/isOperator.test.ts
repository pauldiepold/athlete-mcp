import { describe, it, expect } from 'vitest'
import { isOperator, parseOperatorSubs } from './isOperator'

const SUBS = '111111111111111111111,222222222222222222222'

describe('parseOperatorSubs', () => {
  it('zerlegt die kommagetrennte Liste und trimmt', () => {
    expect(parseOperatorSubs(' 111 , 222 ')).toEqual(['111', '222'])
  })

  it('liefert für Leeres und Fehlendes eine leere Liste', () => {
    expect(parseOperatorSubs('')).toEqual([])
    expect(parseOperatorSubs('  ,  ,')).toEqual([])
    expect(parseOperatorSubs(null)).toEqual([])
    expect(parseOperatorSubs(undefined)).toEqual([])
  })
})

describe('isOperator', () => {
  it('lässt einen allowlisteten Google-sub durch', () => {
    expect(isOperator('google', '111111111111111111111', SUBS)).toBe(true)
    expect(isOperator('google', '222222222222222222222', SUBS)).toBe(true)
  })

  it('weist jeden anderen sub ab', () => {
    expect(isOperator('google', '999999999999999999999', SUBS)).toBe(false)
  })

  it('weist Apple ab, auch wenn der sub in der Liste steht', () => {
    // Die Admin-Fläche darf nicht am fremden Apple-Developer-Konto hängen.
    expect(isOperator('apple', '111111111111111111111', SUBS)).toBe(false)
  })

  it('weist ein unbekanntes Verfahren ab', () => {
    expect(isOperator('github', '111111111111111111111', SUBS)).toBe(false)
    expect(isOperator(null, '111111111111111111111', SUBS)).toBe(false)
    expect(isOperator(undefined, '111111111111111111111', SUBS)).toBe(false)
  })

  it('heißt bei leerer oder fehlender Liste: kein Operator', () => {
    expect(isOperator('google', '111111111111111111111', '')).toBe(false)
    expect(isOperator('google', '111111111111111111111', '   ')).toBe(false)
    expect(isOperator('google', '111111111111111111111', null)).toBe(false)
    expect(isOperator('google', '111111111111111111111', undefined)).toBe(false)
  })

  it('weist einen leeren sub ab, auch wenn die Liste einen leeren Eintrag hätte', () => {
    expect(isOperator('google', '', ',,')).toBe(false)
    expect(isOperator('google', '   ', SUBS)).toBe(false)
    expect(isOperator('google', null, SUBS)).toBe(false)
  })

  it('vergleicht case-sensitiv — ein sub ist eine opake Kennung, kein Name', () => {
    expect(isOperator('google', 'AbC', 'abc')).toBe(false)
    expect(isOperator('google', 'abc', 'abc')).toBe(true)
  })

  it('findet einen sub auch hinter Leerzeichen in der Liste', () => {
    expect(isOperator('google', 'abc', ' abc , def ')).toBe(true)
    expect(isOperator('google', 'xyz', ' abc , def ')).toBe(false)
  })
})
