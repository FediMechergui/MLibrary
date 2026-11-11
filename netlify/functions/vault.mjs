import { vaultRequest } from '../../server/vault.mjs';
export default (request, context) => vaultRequest(request, context);
export const config = { path: '/api/vault/:id' };
