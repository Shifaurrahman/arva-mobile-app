import axios, { AxiosError } from 'axios';

const BASE_URL = 'https://bda9-45-121-88-102.ngrok-free.app';

let authToken: string | null = null;
let currentUserName: string = '';

// Axios instance with shared config
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000, // 30s — LLM calls can be slow
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Attach token to every request automatically
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export async function login(email: string, password: string): Promise<string> {
  const res = await api.post('/api/auth/login', { email, password });
  authToken = res.data.access_token;
  currentUserName = res.data.user?.name || res.data.user?.email || 'there';
  return currentUserName;
}

export async function askARVA(
  message: string,
  history: { role: string; content: string }[] = []
): Promise<string> {
  try {
    const res = await api.post('/api/chat/', {  // ← trailing slash matches server route
      text: message,
      conversation_history: history,
    });

    return (
      res.data.message ||
      res.data.answer ||
      res.data.response ||
      JSON.stringify(res.data)
    );
  } catch (err) {
    const error = err as AxiosError<{ detail?: string }>;

    // Surface the actual server error message if available
    const serverDetail = error.response?.data?.detail;
    const status = error.response?.status;

    if (status === 401) {
      throw new Error('Session expired. Please log in again.');
    }
    if (status === 500) {
      throw new Error(
        serverDetail
          ? `Server error: ${serverDetail}`
          : 'Server error — check your backend logs.'
      );
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. The server took too long to respond.');
    }
    if (!error.response) {
      throw new Error('Could not reach the server. Check your connection.');
    }

    throw new Error(serverDetail || 'Something went wrong.');
  }
}

export function logout() {
  authToken = null;
  currentUserName = '';
}

export function getToken() {
  return authToken;
}

export function getUserName() {
  return currentUserName;
}