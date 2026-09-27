// Dynamic backend and WebSocket URL resolution for AI Studio dev & prod
const isBrowser = typeof window !== 'undefined';
const protocol = isBrowser && window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = isBrowser && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = isBrowser ? window.location.host : 'localhost:3000';

const rawBackendUrl = import.meta.env.VITE_BACKEND_URL || (isBrowser ? `${protocol}//${host}` : "http://localhost:3000");
export const BACKEND_URL = rawBackendUrl.replace("wss://", "https://").replace("ws://", "http://");
export const WS_URL = import.meta.env.VITE_WS_URL || (isBrowser ? `${wsProtocol}//${host}` : "ws://localhost:3000");
