/**
 * The server app module every endpoint of this app lives in.
 *
 * Unlike Post Harvest, nothing here is a site Server Script: the propagation
 * endpoints are whitelisted Python in upande_summer_flowers, so there is no
 * script-routing table and a method name maps straight to a path.
 *
 * One module answers every call. The server keeps the work split across
 * planning_api, crop_protocol, plant_receipt and tc_supply; mobile/api.py is
 * the face it shows the phone, so a refactor behind it needs no app release.
 */
export const API_MODULE = 'upande_summer_flowers.mobile.api';

/**
 * Batches, their QR labels and their logs live in a different Frappe app, so
 * they answer on a different module. Both are named here rather than in the
 * services that call them, because which server module a call lands on is a
 * deployment fact and not something a screen should decide.
 */
export const BATCH_MODULE = 'upande_propagation.mobile.api';

/** `/api/method/...` path and the routing args for `module.function`. */
export function endpoint(method: string): { path: string; args: Record<string, string> } {
  // A dotted path that already names a module is taken as given, so a caller
  // can reach frappe's own endpoints (login, client.get_list) the same way.
  if (method.includes('.') && !method.startsWith('planning.')) {
    return { path: `/api/method/${method}`, args: {} };
  }
  return { path: `/api/method/${API_MODULE}.${method.replace(/^planning\./, '')}`, args: {} };
}
