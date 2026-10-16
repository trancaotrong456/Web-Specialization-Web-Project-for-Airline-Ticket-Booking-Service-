import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './apiClient';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const makeClient = (overrides = {}) => createApiClient({
  baseUrl: 'https://api.example.test/api/v1',
  getAccessToken: () => null,
  refreshAccessToken: async () => null,
  onUnauthorized: () => {},
  fetchImpl: vi.fn(),
  ...overrides,
});

describe('createApiClient', () => {
  it('returns the data inside a successful API envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      message: 'Profile retrieved successfully',
      data: { id: 7, email: 'admin@example.com' },
    }));
    const { request } = makeClient({ fetchImpl });

    await expect(request('/auth/me')).resolves.toEqual({
      id: 7,
      email: 'admin@example.com',
    });
  });

  it('returns a PDF response as a Blob when explicitly requested', async () => {
    const pdf = new Blob(['%PDF-demo'], { type: 'application/pdf' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    const { request } = makeClient({ fetchImpl });
    await expect(request('/bookings/7/ticket', { responseType: 'blob' })).resolves.toBeInstanceOf(Blob);
    expect(fetchImpl.mock.calls[0][1].responseType).toBe('blob');
  });

  it('preserves status and field validation errors from a failed response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      message: 'Validation failed',
      errors: [{ path: 'email', msg: 'Email is invalid' }],
    }, 422));
    const { request } = makeClient({ fetchImpl });

    const error = await request('/auth/register', { method: 'POST' }).catch((reason) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'Validation failed',
      status: 422,
      errors: [{ path: 'email', msg: 'Email is invalid' }],
    });
  });

  it('sends bearer authentication and serializes JSON bodies', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} }));
    const { request } = makeClient({
      fetchImpl,
      getAccessToken: () => 'access-token',
    });

    await request('/auth/me', {
      method: 'PUT',
      body: { full_name: 'Nguyễn Văn An' },
    });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/v1/auth/me');
    expect(options.method).toBe('PUT');
    expect(options.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    }));
    expect(options.body).toBe(JSON.stringify({ full_name: 'Nguyễn Văn An' }));
  });

  it('refreshes once after a 401 and retries with the new access token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 9 } }));
    const refreshAccessToken = vi.fn().mockResolvedValue('fresh-access-token');
    const { request } = makeClient({
      fetchImpl,
      getAccessToken: () => 'expired-access-token',
      refreshAccessToken,
    });

    await expect(request('/users/9')).resolves.toEqual({ id: 9 });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-access-token');
  });

  it.each(['/auth/refresh-token', '/auth/logout'])(
    'does not recursively refresh when %s returns 401',
    async (path) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse({ success: false, message: 'Unauthorized' }, 401)
      );
      const refreshAccessToken = vi.fn();
      const { request } = makeClient({ fetchImpl, refreshAccessToken });

      await expect(request(path, { method: 'POST' })).rejects.toMatchObject({ status: 401 });
      expect(refreshAccessToken).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('ends the session when token refresh fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, message: 'Expired' }, 401)
    );
    const refreshAccessToken = vi.fn().mockRejectedValue(new Error('Refresh revoked'));
    const onUnauthorized = vi.fn();
    const { request } = makeClient({ fetchImpl, refreshAccessToken, onUnauthorized });

    await expect(request('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([409, 422, 500])('preserves a failed retry response (%s) without treating it as an expired session', async (status) => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Replay error' }, status));
    const onUnauthorized = vi.fn();
    const { request } = makeClient({
      fetchImpl,
      refreshAccessToken: vi.fn().mockResolvedValue('fresh-access-token'),
      onUnauthorized,
    });

    await expect(request('/users/9')).rejects.toMatchObject({ status, message: 'Replay error' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('preserves a network failure after refresh without ending the authenticated session', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Expired' }, 401))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const onUnauthorized = vi.fn();
    const { request } = makeClient({ fetchImpl, onUnauthorized, refreshAccessToken: async () => 'fresh-token' });
    await expect(request('/users/9')).rejects.toMatchObject({ status: 0, message: 'Không thể kết nối đến máy chủ.' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('ends the session when the retried request is still unauthorized', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Still unauthorized' }, 401));
    const onUnauthorized = vi.fn();
    const { request } = makeClient({
      fetchImpl,
      refreshAccessToken: vi.fn().mockResolvedValue('fresh-access-token'),
      onUnauthorized,
    });

    await expect(request('/users/9')).rejects.toMatchObject({ status: 401, message: 'Still unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
