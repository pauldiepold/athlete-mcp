/**
 * Der Name, unter dem das Produkt dem Athleten begegnet (Issue #59).
 *
 * Er sagt ehrlich, was passiert: Claude verhält sich **nur dann** so, wenn es das
 * Handwerk aus den Verfahren gelesen hat. Ausdrücklich nicht „Coachmodus" — *Coach*
 * ist im Vokabular schon vergeben, und zwar an den Menschen („der Trainingsplan
 * deines Coaches"); ein Produkt dieses Namens behauptete genau das, was jede Fläche
 * hier dementiert.
 *
 * `athlete-mcp` bleibt Repo- und Worker-Name und taucht in **keiner** Nutzerfläche
 * mehr auf: Es ist ein Repo-Name, der für einen Athleten ohne Technikhintergrund
 * nichts bedeutet und dessen „MCP" sich nie erklärt.
 *
 * Die Konstante steht hier und nicht in der Weboberfläche, weil zwei Seiten sie
 * brauchen: die Seitentitel samt Wortmarke im Header **und** der `name` des
 * MCP-Servers — der Name, den Claude in seiner Connector-Liste zeigt.
 */
export const PRODUKTNAME = 'Trainermodus'
