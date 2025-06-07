// API Configuration
export const API_CONFIG = {
  // Base URL for the API server
  // Use environment variable or fallback to default
  BASE_URL: typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:8000',

  // Frontend URL for redirects
  FRONTEND_URL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',

  // Google OAuth Client ID
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'client_id',
  

  // API endpoints
  ENDPOINTS: {
    // Chat endpoints
    NEW_SESSION: '/sessions/new',
    SESSIONS: '/sessions/',
    DELETE_SESSION: '/sessions',  // Will be used with /{session_id}
    CHAT: '/chat/',
    AGENTS: '/agents/',

    // Auth endpoints
    LOGOUT: '/logout',
    GOOGLE_AUTH: '/auth/google'
  }
} as const;

// Helper function to build full API URLs
export const buildApiUrl = (endpoint: string, params?: string | number | Record<string, string>): string => {
  const baseUrl = API_CONFIG.BASE_URL;
  let url = `${baseUrl}${endpoint}`;

  if (typeof params === 'string' || typeof params === 'number') {
    if(!url.endsWith('/')) {
        url += '/';
    }
    url += `${params}`;
  } else if (typeof params === 'object' && params !== null) {
    const queryString = new URLSearchParams(params as Record<string,string>).toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}; 