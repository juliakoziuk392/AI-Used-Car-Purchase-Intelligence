import type {
  AnalysisDto,
  AuthResponse,
  CreateListingInput,
  ListingDto,
  LoginInput,
  RegisterInput,
  UserDto,
} from '@carintel/shared';

const TOKEN_KEY = 'carintel.token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.message ?? response.statusText);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  register: (input: RegisterInput) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: LoginInput) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => request<UserDto>('/auth/me'),

  listListings: () => request<ListingDto[]>('/listings'),
  getListing: (id: string) => request<ListingDto>(`/listings/${id}`),
  createListing: (input: CreateListingInput) =>
    request<ListingDto>('/listings', { method: 'POST', body: JSON.stringify(input) }),
  deleteListing: (id: string) => request<void>(`/listings/${id}`, { method: 'DELETE' }),

  startAnalysis: (listingId: string) =>
    request<AnalysisDto>(`/listings/${listingId}/analyses`, { method: 'POST' }),
  getAnalysis: (id: string) => request<AnalysisDto>(`/analyses/${id}`),
};

/**
 * Читає SSE-стрім аналізу. Використовуємо fetch, а не EventSource,
 * бо EventSource не вміє передавати заголовок Authorization.
 */
export async function streamAnalysis(
  id: string,
  onUpdate: (analysis: AnalysisDto) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = tokenStorage.get();
  const response = await fetch(`/api/analyses/${id}/events`, {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
  });
  if (!response.ok || !response.body) throw new ApiError(response.status, response.statusText);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onUpdate(JSON.parse(data) as AnalysisDto);
    }
  }
}
