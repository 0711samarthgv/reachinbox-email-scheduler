export const API_URL = 'http://localhost:4000';
async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    }
  );

  if (!response.ok) {
    let message = 'Request failed';

    try {
      const data = await response.json();

      if (data?.error) {
        message = data.error;
      }
    } catch {
      // Ignore JSON parsing errors
    }

    throw new Error(message);
  }

  return response.json();
}

export const api = {
  // User
  me: () =>
    request<any>('/api/users/me'),

  // Emails
  scheduled: () =>
    request<any[]>('/api/emails/scheduled'),

  sent: () =>
    request<any[]>('/api/emails/sent'),

  counts: () =>
    request<{
      scheduled: number;
      sent: number;
    }>('/api/emails/stats/counts'),

  search: (q: string) =>
    request<any[]>(
      `/api/emails/search?q=${encodeURIComponent(q)}`
    ),

  email: (id: string) =>
    request<any>(
      `/api/emails/${id}`
    ),

  schedule: (data: any) =>
    request<any>(
      '/api/emails/schedule',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  // Slack
  slackStatus: () =>
    request<any>('/api/slack/status'),

  // Authentication
  logout: () =>
    request<any>(
      '/api/auth/logout',
      {
        method: 'POST',
      }
    ),

  login: (
    email: string,
    password: string
  ) =>
    request<any>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      }
    ),

  register: (
    name: string,
    email: string,
    password: string
  ) =>
    request<any>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      }
    ),
};