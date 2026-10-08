export class ApiError extends Error {
  constructor(message, { status = 0, errors = null, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.data = data;
  }
}

const trimSlashes = (value, side = 'both') => {
  if (side === 'start') return value.replace(/^\/+/, '');
  if (side === 'end') return value.replace(/\/+$/, '');
  return value.replace(/^\/+|\/+$/g, '');
};

const isJsonBody = (body) => body
  && typeof body === 'object'
  && !(body instanceof FormData)
  && !(body instanceof URLSearchParams)
  && !(body instanceof Blob);

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (response.status === 204) return null;
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text ? { message: text } : null;
};

export const createApiClient = ({
  baseUrl,
  getAccessToken,
  refreshAccessToken,
  onUnauthorized,
  fetchImpl = window.fetch.bind(window),
}) => {
  let refreshPromise = null;

  const request = async (path, options = {}, retryState = {}) => {
    const normalizedPath = `/${trimSlashes(path, 'start')}`;
    const url = `${trimSlashes(baseUrl, 'end')}${normalizedPath}`;
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const token = retryState.accessToken || getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let body = options.body;
    if (isJsonBody(body)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(url, { ...options, headers, body });
    } catch (error) {
      throw new ApiError('Không thể kết nối đến máy chủ.', { data: error });
    }

    const payload = await parseResponse(response);
    const isRefreshBoundary = normalizedPath === '/auth/refresh-token'
      || normalizedPath === '/auth/logout';

    if (response.status === 401 && !retryState.retried && !isRefreshBoundary) {
      let refreshedToken;
      try {
        if (!refreshPromise) {
          refreshPromise = Promise.resolve().then(() => refreshAccessToken());
        }
        refreshedToken = await refreshPromise;
        if (!refreshedToken) throw new Error('Refresh did not return an access token');
      } catch (_error) {
        onUnauthorized?.();
      } finally {
        refreshPromise = null;
      }
      if (refreshedToken) return request(path, options, { retried: true, accessToken: refreshedToken });
    }

    if (response.status === 401 && retryState.retried) onUnauthorized?.();

    if (!response.ok) {
      throw new ApiError(payload?.message || 'Yêu cầu không thể hoàn tất.', {
        status: response.status,
        errors: payload?.errors || null,
        data: payload?.data || null,
      });
    }

    if (payload?.pagination && Object.prototype.hasOwnProperty.call(payload, 'data')) {
      return { data: payload.data, pagination: payload.pagination };
    }
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) {
      return payload.data;
    }
    return payload;
  };

  return { request };
};
