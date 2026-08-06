/**
 * Nicht erratbare Token in der einen Form, in der dieses System sie braucht:
 * URL- und pfadsicher, ohne Padding.
 *
 * Es gibt davon inzwischen drei Sorten — Invite-Codes, der `state` über den
 * Provider-Hop und die generierten `userId` neuer Konten —, und alle drei wollen
 * dieselbe Zeile. Sie steht deshalb hier, nicht dreimal nebeneinander.
 *
 * base64url ist nicht nur bequem: Sein Alphabet enthält strukturell **kein `:`**, und
 * das Token-Format des OAuth-Providers ist `userId:grantId:secret` (Issue #43).
 *
 * Bewusst nur Web-APIs (crypto/btoa), damit das Modul ohne @types/node neben dem
 * Worker-Code typecheckt; läuft in Node wie im Worker.
 */

/** `bytes` Zufallsbytes als base64url — 24 Bytes ergeben 32 Zeichen. */
export function zufallsToken(bytes: number): string {
  const rohdaten = new Uint8Array(bytes);
  crypto.getRandomValues(rohdaten);

  let binaer = "";
  for (const b of rohdaten) binaer += String.fromCharCode(b);
  return btoa(binaer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
