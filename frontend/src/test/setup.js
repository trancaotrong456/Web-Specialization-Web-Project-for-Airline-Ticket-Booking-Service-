import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mock socket.io-client so tests never open a real WebSocket connection.
vi.mock('socket.io-client', () => {
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { io: vi.fn(() => socket), default: vi.fn(() => socket) };
});

// Mock the frontend socket singleton as well so any consumers of lib/socket
// use the same no-op stub without attempting a real network connection.
vi.mock('../../lib/socket', async () => {
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return {
    getSocket: vi.fn(() => socket),
    closeSocket: vi.fn(),
    useFlightSocket: vi.fn(() => ({ connected: false, lastWarning: null, clearWarning: vi.fn() })),
  };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
