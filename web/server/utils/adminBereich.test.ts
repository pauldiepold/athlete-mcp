import { describe, it, expect } from 'vitest'
import { adminBereich } from './adminBereich'

describe('adminBereich', () => {
  it('erkennt die Fläche', () => {
    expect(adminBereich('/admin')).toBe('seite')
    expect(adminBereich('/admin/')).toBe('seite')
    expect(adminBereich('/admin/konten')).toBe('seite')
  })

  it('erkennt die Endpunkte', () => {
    expect(adminBereich('/api/admin/konten')).toBe('api')
  })

  it('lässt alles andere durch', () => {
    expect(adminBereich('/')).toBe(null)
    expect(adminBereich('/api/woche')).toBe(null)
    expect(adminBereich('/administration')).toBe(null)
    expect(adminBereich('/api/administration/x')).toBe(null)
  })

  it('urteilt über den Pfad ohne Query — sonst schlüpft /admin?x=1 durch', () => {
    const query = (pfad: string) => adminBereich(new URL(pfad, 'http://x').pathname)

    expect(query('/admin?x=1')).toBe('seite')
    expect(query('/admin/konten?seite=2')).toBe('seite')
    expect(query('/api/admin/konten?seite=2')).toBe('api')
  })
})
