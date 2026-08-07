/**
 * Ein KV-Namespace-Scan über alle Seiten hinweg — die eine Stelle, an der die
 * Cursor-Schleife von `kv.list` steht.
 *
 * `kv.list` liefert seitenweise. Wer den Cursor vergisst, bekommt bei wenigen
 * Einträgen dasselbe Ergebnis wie mit — und verliert später still einzelne Athleten:
 * der Cron holte deren Körperdaten nicht mehr, eine Identitäts-Auflösung fände ihren
 * Invite-Code nicht. Ein Fehler, der erst mit dem Wachstum auftaucht und dann nach
 * einem Datenproblem aussieht, nicht nach einem Schleifenfehler.
 *
 * Bis ADR-0007 lag diese Schleife zweimal vor, je einmal pro Deployable. Mit einer
 * einzigen Bibliothek gibt es dafür keinen Grund mehr.
 */

/** Alle Key-Namen unter `prefix`, über die Pagination hinweg. */
export async function listKvKeys(
  kv: KVNamespace,
  prefix: string,
): Promise<string[]> {
  const namen: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await kv.list({ prefix, cursor });
    for (const { name } of res.keys) namen.push(name);
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return namen;
}
