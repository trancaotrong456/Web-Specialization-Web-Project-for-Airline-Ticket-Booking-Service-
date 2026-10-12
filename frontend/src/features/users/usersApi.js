const queryString = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  });
  return query.toString();
};

export const createUsersApi = (request) => ({
  list: (params) => request(`/users?${queryString(params)}`),
  get: (id) => request(`/users/${id}`),
  setStatus: (id, status) => request(`/users/${id}/status`, { method: 'PUT', body: { status } }),
  setRole: (id, role_id) => request(`/users/${id}/role`, { method: 'PUT', body: { role_id } }),
  remove: (id) => request(`/users/${id}`, { method: 'DELETE' }),
});
