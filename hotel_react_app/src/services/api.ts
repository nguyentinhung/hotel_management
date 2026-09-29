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
      let message: string | undefined;
      try {
        const parsed = errorText ? JSON.parse(errorText) : null;
        message = parsed?.message;
      } catch {
        // Some servers return an HTML 404 page when the API route is not loaded.
      }

      if (!message && /<!doctype html|<html/i.test(errorText)) {
        message = response.status === 404
          ? 'Backend chưa nhận endpoint đặt phòng mới. Hãy khởi động lại hotel_backend rồi thử lại.'
          : `Backend trả về trang HTML thay vì JSON (HTTP ${response.status}).`;
      }

      throw new Error(message || `Request failed: ${response.status}`);
    }

    return response.json();
  },
};

export default api;
