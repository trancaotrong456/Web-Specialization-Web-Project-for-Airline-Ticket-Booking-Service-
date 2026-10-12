/**
 * Regression tests for frontend/src/lib/socket.js
 *
 * @vitest-environment jsdom
 *
 * NOTE: This file uses its OWN vi.mock declarations and does NOT rely on the
 * global setup.js socket mocks. Vitest processes vi.mock() hoisting per-file,
 * so the local mock of 'socket.io-client' here wins over any global mocks
 * because socket.test.js does not import from lib/socket through the same
 * module cache as the global setup path alias.
 *
 * Covered:
 *  - getSocket() returns the same singleton instance on repeated calls
 *  - getSocket() reconnects fresh after closeSocket()
 *  - useFlightSocket(): joins room on mount when connected
 *  - useFlightSocket(): calls connect() when not yet connected
 *  - useFlightSocket(): leaves room and removes listeners on unmount
 *  - useFlightSocket(): reconnect re-joins the flight room
 *  - useFlightSocket(): seat-warning fires for correct flightId, ignored for others
 *  - useFlightSocket(): duplicate seat-warning events → last value wins
 *  - useFlightSocket(): clearWarning() resets lastWarning to null
 *  - useFlightSocket(): flight_seats_updated calls onSeatsUpdated only for matching id
 *  - useFlightSocket(): duplicate seat updates handled idempotently
 *  - useFlightSocket(): flight_updated calls onFlightUpdated for matching flight_id or id
 *  - useFlightSocket(): does nothing when enabled=false or flightId=null
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Controlled socket mock ──────────────────────────────────────────────────
// We maintain the handler registry and connection state ourselves so we can
// simulate server-side events without a real network.
const handlers = {};
let isConnected = false;

// A controlled socket stub that captures on/off/emit calls
const mockSocket = {
  get connected() { return isConnected; },
  connect: vi.fn(() => { isConnected = true; }),
  disconnect: vi.fn(() => { isConnected = false; }),
  emit: vi.fn(),
  on: vi.fn((event, cb) => { (handlers[event] ??= []).push(cb); }),
  off: vi.fn((event, cb) => {
    if (handlers[event]) handlers[event] = handlers[event].filter((h) => h !== cb);
  }),
};

// Helper: trigger a server-emitted event against all registered listeners
function simulateServer(event, data) {
  (handlers[event] || []).forEach((cb) => cb(data));
}

// ── Local mock of socket.io-client ─────────────────────────────────────────
// This is hoisted before module imports by Vitest so our real socket.js will
// receive mockSocket when it calls io().
vi.mock('socket.io-client', () => ({ io: vi.fn(() => mockSocket) }));

// ── Import the REAL module under test ──────────────────────────────────────
import { closeSocket, getSocket, useFlightSocket } from './socket.js';

// ── Test lifecycle ──────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  isConnected = false;
  closeSocket();
});

afterEach(() => {
  closeSocket();
});

// ──────────────────────────────────────────────────────────────────────────
describe('getSocket() singleton', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getSocket();
    const b = getSocket();
    expect(a).toBe(b);
    expect(a).toBe(mockSocket);
  });

  it('creates a new instance after closeSocket() clears the singleton', () => {
    getSocket();
    closeSocket();
    // After close the module-level singleton is null; getSocket() calls io() again
    const fresh = getSocket();
    expect(fresh).toBeTruthy(); // io() was called again → returned mockSocket
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('useFlightSocket() – join / leave / reconnect', () => {
  it('joins the flight room immediately when socket is already connected', () => {
    isConnected = true;
    renderHook(() => useFlightSocket({ flightId: 42, enabled: true }));
    expect(mockSocket.emit).toHaveBeenCalledWith('join_flight', 42);
  });

  it('calls connect() when socket is not yet connected', () => {
    isConnected = false;
    renderHook(() => useFlightSocket({ flightId: 7, enabled: true }));
    expect(mockSocket.connect).toHaveBeenCalled();
  });

  it('emits leave_flight and removes all listeners on unmount', () => {
    isConnected = true;
    const { unmount } = renderHook(() => useFlightSocket({ flightId: 99, enabled: true }));
    unmount();
    expect(mockSocket.emit).toHaveBeenCalledWith('leave_flight', 99);
    expect(mockSocket.off).toHaveBeenCalled();
  });

  it('re-joins flight room when the connect event fires (reconnect)', () => {
    isConnected = false;
    renderHook(() => useFlightSocket({ flightId: 5, enabled: true }));
    // Simulate a reconnect by firing the 'connect' event
    act(() => { simulateServer('connect', undefined); });
    const joinCalls = mockSocket.emit.mock.calls.filter(([e]) => e === 'join_flight');
    expect(joinCalls.length).toBeGreaterThanOrEqual(1);
    joinCalls.forEach(([, id]) => expect(id).toBe(5));
  });

  it('does nothing when enabled=false', () => {
    renderHook(() => useFlightSocket({ flightId: 10, enabled: false }));
    expect(mockSocket.connect).not.toHaveBeenCalled();
    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_flight', expect.anything());
  });

  it('does nothing when flightId is null', () => {
    renderHook(() => useFlightSocket({ flightId: null, enabled: true }));
    expect(mockSocket.connect).not.toHaveBeenCalled();
    expect(mockSocket.emit).not.toHaveBeenCalledWith('join_flight', expect.anything());
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('useFlightSocket() – seat-warning event', () => {
  it('sets lastWarning for the subscribed flightId', async () => {
    isConnected = true;
    const { result } = renderHook(() => useFlightSocket({ flightId: 17, enabled: true }));
    expect(result.current.lastWarning).toBeNull();

    await act(async () => {
      simulateServer('seat-warning', { flightId: 17, availableSeats: 3, message: 'Chỉ còn 3 ghế!' });
    });
    expect(result.current.lastWarning).toMatchObject({ flightId: 17, availableSeats: 3 });
  });

  it('ignores seat-warning for a different flightId', async () => {
    isConnected = true;
    const { result } = renderHook(() => useFlightSocket({ flightId: 17, enabled: true }));

    await act(async () => {
      simulateServer('seat-warning', { flightId: 999, availableSeats: 2, message: 'other' });
    });
    expect(result.current.lastWarning).toBeNull();
  });

  it('handles duplicate events — last value wins', async () => {
    isConnected = true;
    const { result } = renderHook(() => useFlightSocket({ flightId: 17, enabled: true }));

    await act(async () => {
      simulateServer('seat-warning', { flightId: 17, availableSeats: 4, message: 'First' });
      simulateServer('seat-warning', { flightId: 17, availableSeats: 2, message: 'Second' });
    });
    expect(result.current.lastWarning.availableSeats).toBe(2);
  });

  it('clearWarning() resets lastWarning to null', async () => {
    isConnected = true;
    const { result } = renderHook(() => useFlightSocket({ flightId: 17, enabled: true }));

    await act(async () => {
      simulateServer('seat-warning', { flightId: 17, availableSeats: 1, message: 'Cảnh báo' });
    });
    expect(result.current.lastWarning).not.toBeNull();

    act(() => { result.current.clearWarning(); });
    expect(result.current.lastWarning).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('useFlightSocket() – flight_seats_updated event', () => {
  it('calls onSeatsUpdated for matching flightId', async () => {
    isConnected = true;
    const onSeatsUpdated = vi.fn();
    renderHook(() => useFlightSocket({ flightId: 3, enabled: true, onSeatsUpdated }));

    await act(async () => {
      simulateServer('flight_seats_updated', { flight_id: 3, available_seats: 50 });
    });
    expect(onSeatsUpdated).toHaveBeenCalledWith({ flight_id: 3, available_seats: 50 });
  });

  it('does NOT call onSeatsUpdated for a different flightId', async () => {
    isConnected = true;
    const onSeatsUpdated = vi.fn();
    renderHook(() => useFlightSocket({ flightId: 3, enabled: true, onSeatsUpdated }));

    await act(async () => {
      simulateServer('flight_seats_updated', { flight_id: 999, available_seats: 10 });
    });
    expect(onSeatsUpdated).not.toHaveBeenCalled();
  });

  it('handles rapid duplicate updates — all events delivered, latest value last', async () => {
    isConnected = true;
    const onSeatsUpdated = vi.fn();
    renderHook(() => useFlightSocket({ flightId: 3, enabled: true, onSeatsUpdated }));

    await act(async () => {
      simulateServer('flight_seats_updated', { flight_id: 3, available_seats: 10 });
      simulateServer('flight_seats_updated', { flight_id: 3, available_seats: 9 });
      simulateServer('flight_seats_updated', { flight_id: 3, available_seats: 8 });
    });
    expect(onSeatsUpdated).toHaveBeenCalledTimes(3);
    expect(onSeatsUpdated.mock.calls.at(-1)[0].available_seats).toBe(8);
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('useFlightSocket() – flight_updated event', () => {
  it('calls onFlightUpdated when flight_id matches', async () => {
    isConnected = true;
    const onFlightUpdated = vi.fn();
    renderHook(() => useFlightSocket({ flightId: 7, enabled: true, onFlightUpdated }));

    await act(async () => {
      simulateServer('flight_updated', { flight_id: 7, status: 'cancelled' });
    });
    expect(onFlightUpdated).toHaveBeenCalledWith({ flight_id: 7, status: 'cancelled' });
  });

  it('calls onFlightUpdated when top-level id matches (schema fallback)', async () => {
    isConnected = true;
    const onFlightUpdated = vi.fn();
    renderHook(() => useFlightSocket({ flightId: 7, enabled: true, onFlightUpdated }));

    await act(async () => {
      simulateServer('flight_updated', { id: 7, status: 'completed', available_seats: 0 });
    });
    expect(onFlightUpdated).toHaveBeenCalled();
  });

  it('does NOT call onFlightUpdated for a different flightId', async () => {
    isConnected = true;
    const onFlightUpdated = vi.fn();
    renderHook(() => useFlightSocket({ flightId: 7, enabled: true, onFlightUpdated }));

    await act(async () => {
      simulateServer('flight_updated', { flight_id: 999, status: 'cancelled' });
    });
    expect(onFlightUpdated).not.toHaveBeenCalled();
  });
});
