/**
 * Welchen Teil der Operator-Fläche adressiert dieser Pfad?
 *
 * Bewusst **rein** und über den reinen `pathname`, nicht über `event.path`: Letzteres
 * ist in h3 v1 die rohe `req.url` samt Query, und `/admin?x=1` ist damit weder gleich
 * `/admin` noch beginnt es mit `/admin/` — der Guard hätte den Aufruf durchgewunken.
 *
 * `null` heißt: geht den Guard nichts an.
 */
export function adminBereich(pathname: string): 'seite' | 'api' | null {
  if (pathname.startsWith('/api/admin/')) {
    return 'api'
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return 'seite'
  }

  return null
}
