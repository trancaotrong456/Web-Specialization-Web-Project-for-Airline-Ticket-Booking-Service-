const REFRESH_TOKEN_KEY = 'airline_refresh_token';

export const tokenStorage = {
  getRefreshToken() {
    return window.sessionStorage.getItem(REFRESH_TOKEN_KEY)
      || window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setRefreshToken(token, remember = false) {
    this.clearRefreshToken();
    const targetStorage = remember ? window.localStorage : window.sessionStorage;
    targetStorage.setItem(REFRESH_TOKEN_KEY, token);
  },

  clearRefreshToken() {
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
