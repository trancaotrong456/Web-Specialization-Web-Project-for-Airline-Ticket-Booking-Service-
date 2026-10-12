export const createRolesApi = (request) => ({
  list: () => request('/roles'),
  get: (id) => request(`/roles/${id}`),
  create: (payload) => request('/roles', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/roles/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
});
