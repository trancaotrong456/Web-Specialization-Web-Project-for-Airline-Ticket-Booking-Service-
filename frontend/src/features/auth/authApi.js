export const createAuthApi = (request) => ({
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  refreshToken: (refreshToken) => request('/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken },
  }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  }),
  resetPassword: (token, newPassword) => request('/auth/reset-password', {
    method: 'POST',
    body: { token, new_password: newPassword },
  }),
});
