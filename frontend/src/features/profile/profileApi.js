export const createProfileApi = (request) => ({
  getMe: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PUT', body: payload }),
  changePassword: (payload) => request('/auth/change-password', { method: 'PUT', body: payload }),
});
