import { describe, expect, it } from 'vitest';
import { tokenStorage } from './tokenStorage';

const STORAGE_KEY = 'airline_refresh_token';

describe('tokenStorage', () => {
  it('stores the refresh token in session storage by default', () => {
    tokenStorage.setRefreshToken('session-token', false);

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('session-token');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBe('session-token');
  });

  it('stores remembered refresh tokens in local storage', () => {
    tokenStorage.setRefreshToken('remembered-token', true);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('remembered-token');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBe('remembered-token');
  });

  it('moves a token between stores instead of leaving stale credentials', () => {
    tokenStorage.setRefreshToken('old-session-token', false);
    tokenStorage.setRefreshToken('new-local-token', true);

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('new-local-token');
  });

  it('clears refresh credentials from both stores', () => {
    window.sessionStorage.setItem(STORAGE_KEY, 'session-token');
    window.localStorage.setItem(STORAGE_KEY, 'local-token');

    tokenStorage.clearRefreshToken();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
