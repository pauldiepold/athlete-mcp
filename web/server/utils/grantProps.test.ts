import { describe, it, expect } from 'vitest'
import { userIdAusProps } from './grantProps'

describe('userIdAusProps', () => {
  it('liefert die userId aus den Props eines Grants', () => {
    expect(userIdAusProps({ userId: 'paul' })).toBe('paul')
  })

  it('ignoriert alles, was neben der userId in den Props steht', () => {
    // Die Props tragen laut ADR-0007 ausschließlich die userId. Steht dort aus einem
    // alten Grant noch mehr, wird es nicht gelesen statt mitgeschleppt: Anzeigename
    // und Verbindungen kommen pro Request frisch aus dem KV.
    expect(userIdAusProps({ userId: 'paul', displayName: 'Alt', scope: ['athlete'] })).toBe('paul')
  })

  it('weist fehlende Props ab — ohne Token gibt es keinen Athleten', () => {
    expect(userIdAusProps(undefined)).toBeNull()
    expect(userIdAusProps(null)).toBeNull()
  })

  it('weist Props ohne brauchbare userId ab', () => {
    expect(userIdAusProps({})).toBeNull()
    expect(userIdAusProps({ userId: '' })).toBeNull()
    expect(userIdAusProps({ userId: '   ' })).toBeNull()
    expect(userIdAusProps({ userId: 42 })).toBeNull()
    expect(userIdAusProps('paul')).toBeNull()
  })

  it('weist eine userId mit Doppelpunkt ab', () => {
    // Das Token-Format des Providers ist `userId:grantId:secret`. Eine userId mit `:`
    // kann strukturell nicht entstehen — käme sie hier trotzdem an, wäre etwas an der
    // Kette faul, und die falsche Antwort auf „wer fragt hier" liefert fremde Daten aus.
    expect(userIdAusProps({ userId: 'paul:jonas' })).toBeNull()
    expect(userIdAusProps({ userId: ':' })).toBeNull()
  })

  it('trimmt Rand-Leerzeichen, statt sie in den D1-Schlüssel zu tragen', () => {
    expect(userIdAusProps({ userId: ' paul ' })).toBe('paul')
  })
})
