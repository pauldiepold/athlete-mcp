/**
 * Mandanten-Identität (geteilte Server-Shell): bildet das Pfad-Secret aus der
 * MCP-URL (`/{secret}/mcp`) auf eine userId ab (KV `pathsecret:<secret>`).
 * Unbekanntes oder fehlendes Secret → null (der fetch-Handler antwortet dann 404).
 * Kritisch für die Mandantentrennung: ein falsches Mapping würde fremde Daten
 * ausliefern. Siehe docs/adr/0001-athlete-mcp-ein-worker-mehrere-kontexte.md.
 */

const PATH_PATTERN = /^\/([^/]+)\/mcp$/;

export class TenantResolver {
  constructor(private readonly kv: KVNamespace) {}

  /** Request-Pfad → userId; null bei nicht passendem Pfad oder unbekanntem Secret. */
  async resolve(pathname: string): Promise<string | null> {
    const match = pathname.match(PATH_PATTERN);
    if (!match) {
      return null;
    }

    const secret = match[1];
    return (await this.kv.get(`pathsecret:${secret}`)) ?? null;
  }
}
