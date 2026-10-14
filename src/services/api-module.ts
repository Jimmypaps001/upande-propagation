/**
 * The server app module every endpoint of this app lives in.
 *
 * Unlike Post Harvest, nothing here is a site Server Script: the propagation
 * endpoints are whitelisted Python in upande_summer_flowers, so there is no
 * script-routing table and a method name maps straight to a path.
 */
export const API_MODULE = 'upande_summer_flowers.summer_flowers.planning_api';

/** `/api/method/...` path and the routing args for `module.function`. */
export function endpoint(method: string): { path: string; args: Record<string, string> } {
  // A dotted path that already names a module is taken as given, so a caller
  // can reach frappe's own endpoints (login, client.get_list) the same way.
  if (method.includes('.') && !method.startsWith('planning.')) {
    return { path: `/api/method/${method}`, args: {} };
  }
  return { path: `/api/method/${API_MODULE}.${method.replace(/^planning\./, '')}`, args: {} };
}
