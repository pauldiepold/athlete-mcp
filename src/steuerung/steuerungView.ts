/**
 * Read-only HTML-Surface auf den Steuerungs-Store: die zweite, menschen-gerichtete
 * Surface des Workers neben der MCP-URL (siehe docs/adr/0003). Rein serverseitig
 * gerendert (Markdown→HTML via `marked` + Inline-CSS), kein Frontend/Build.
 *
 * Eigenes read-only View-Secret (`viewsecret:<secret>` → userId), getrennt vom
 * MCP-Schreib-Secret — ein geleaktes View-URL gibt nur Lesezugriff frei. Das
 * Rendering liest ausschließlich über den vorhandenen SteuerungStore; die Ansicht
 * ist eine Read-Surface des Steuerung-Kontexts, kein neuer Kontext.
 *
 * Routen:
 *   /{secret}/steuerung        → Steuerungsplan + Wochenliste (neueste zuerst)
 *   /{secret}/steuerung/{kw}   → eine Woche, mit Prev/Next/Index-Navigation
 *
 * Markdown ist agent-geschrieben (Single-Writer, vertrauenswürdig) → bewusst kein
 * HTML-Sanitizing über das von `marked` Erzeugte hinaus.
 */

import { marked } from "marked";

import { SteuerungStore, isValidKw } from "./steuerungStore.js";
import { TenantResolver } from "../tenantResolver.js";

const VIEW_PATTERN = /^\/([^/]+)\/steuerung(?:\/([^/]+))?$/;

/** Minimales HTML-Escaping für in Markup interpolierte Klartext-Werte. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE = `
  :root { color-scheme: light dark; }
  body {
    font: 16px/1.6 system-ui, -apple-system, sans-serif;
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 4rem;
  }
  nav {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    font-size: 0.95rem;
  }
  nav .spacer { flex: 1; }
  nav a { text-decoration: none; }
  h1 { font-size: 1.5rem; }
  h2 { margin-top: 2rem; }
  a { color: #2563eb; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); padding: 0.4rem 0.6rem; text-align: left; }
  code, pre { font-family: ui-monospace, monospace; }
  pre { padding: 0.8rem; overflow-x: auto; background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 6px; }
  ul.wochen { list-style: none; padding: 0; }
  ul.wochen li { margin: 0.3rem 0; }
  .leer { opacity: 0.6; font-style: italic; }
`;

/** Vollständiges HTML-Dokument mit Inline-CSS um den gerenderten Body. */
function page(title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>${body}</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Markdown → HTML (GFM, inkl. Tabellen für Soll/Ist). */
function renderMarkdown(md: string): string {
  return marked.parse(md, { gfm: true, async: false });
}

/** Index: Steuerungsplan oben, darunter die Wochen als Links (neueste zuerst). */
function renderIndex(
  secret: string,
  plan: string,
  wochen: string[],
  canEdit: boolean,
): Response {
  const base = `/${secret}/steuerung`;
  const planHtml = plan
    ? renderMarkdown(plan)
    : `<p class="leer">Noch kein Steuerungsplan gesetzt.</p>`;
  const wochenHtml = wochen.length
    ? `<ul class="wochen">${[...wochen]
        .reverse()
        .map((kw) => `<li><a href="${base}/${kw}">${kw}</a></li>`)
        .join("")}</ul>`
    : `<p class="leer">Noch keine Wocheneinträge.</p>`;

  // Der Bearbeiten-Link führt auf die Nuxt-Edit-Seite (Issue #12); auf der
  // schlichten Worker-Surface (ADR-0003) existiert sie nicht → nur mit canEdit.
  const editNav = canEdit ? `<nav><a href="${base}/edit">Bearbeiten</a></nav>\n` : "";

  return page(
    "Steuerungsplan",
    `${editNav}<h1>Steuerungsplan</h1>
${planHtml}
<h2>Wochen</h2>
${wochenHtml}`,
  );
}

/** Eine Woche mit Prev/Next/Index-Navigation (Prev/Next überspringen Lücken). */
function renderWoche(
  secret: string,
  kw: string,
  content: string,
  wochen: string[],
): Response {
  const base = `/${secret}/steuerung`;
  const prev = [...wochen].reverse().find((w) => w < kw);
  const next = wochen.find((w) => w > kw);

  const left = prev
    ? `<a href="${base}/${prev}">← ${prev}</a>`
    : `<span class="leer">←</span>`;
  const right = next
    ? `<a href="${base}/${next}">${next} →</a>`
    : `<span class="leer">→</span>`;

  const body = content
    ? renderMarkdown(content)
    : `<p class="leer">Für ${escapeHtml(kw)} gibt es keinen Eintrag.</p>`;

  return page(
    kw,
    `<nav>${left}<span class="spacer"></span><a href="${base}">Index</a><span class="spacer"></span>${right}</nav>
<h1>${escapeHtml(kw)}</h1>
${body}`,
  );
}

/**
 * Dispatcht eine Browser-Anfrage auf die Steuerungs-Ansicht.
 * Liefert `null`, wenn der Pfad keine View-Route ist (der Aufrufer routet dann
 * weiter, z. B. zur MCP-Surface). Unbekanntes View-Secret → 404.
 *
 * `canEdit` blendet den Bearbeiten-Link ein — nur das Nuxt-Frontend (Issue #12)
 * hat die Edit-Seite; die schlichte Worker-Surface (ADR-0003) setzt es nicht.
 */
export async function handleSteuerungView(
  pathname: string,
  kv: KVNamespace,
  db: D1Database,
  canEdit = false,
): Promise<Response | null> {
  const match = pathname.match(VIEW_PATTERN);
  if (!match) {
    return null;
  }

  const secret = match[1]!;
  const kw = match[2];
  if (kw !== undefined && !isValidKw(kw)) {
    return new Response("Not found", { status: 404 });
  }

  const userId = await new TenantResolver(kv).resolveViewSecret(secret);
  if (!userId) {
    return new Response("Not found", { status: 404 });
  }

  const store = new SteuerungStore(db);

  if (kw === undefined) {
    const [plan, wochen] = await Promise.all([
      store.getPlan(userId),
      store.listWochen(userId),
    ]);
    return renderIndex(secret, plan, wochen, canEdit);
  }

  const [content, wochen] = await Promise.all([
    store.getWoche(userId, kw),
    store.listWochen(userId),
  ]);
  return renderWoche(secret, kw, content, wochen);
}
