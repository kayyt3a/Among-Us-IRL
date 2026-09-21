import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@irl-impostor/shared';

// No URL = same origin. In dev, vite.config.ts proxies /socket.io to the local
// server; in production the server serves the built client itself.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});
