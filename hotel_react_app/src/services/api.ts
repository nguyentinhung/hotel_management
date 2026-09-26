const API_BASE_URL = 'http://localhost:5000';

export const api = {
  get: async <T>(url: string, token?: string): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  },

  post: async <T>(url: string, body: unknown, token?: string): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = errorText ? JSON.parse(errorText) : null;
      throw new Error(parsed?.message || `Request failed: ${response.status}`);
    }

    return response.json();
  },
};

export default api;
