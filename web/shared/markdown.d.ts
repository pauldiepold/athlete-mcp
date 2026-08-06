/**
 * Markdown-Importe sind Rohtext.
 *
 * Gebraucht für die Verfahrenstexte unter `src/steuerung/verfahren/` (ADR-0008): Sie
 * liegen als Markdown im Repo und werden beim Build als String ins Bundle gezogen —
 * Nitro löst `.md`-Importe selbst so auf, TypeScript muss es nur wissen.
 */
declare module '*.md' {
  const inhalt: string
  export default inhalt
}
