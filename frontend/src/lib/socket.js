import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

let socketInstance = null;
let socketAccessToken = null;

/**
 * Returns the shared Socket.IO client singleton.
 *
 * URL resolution (in priority order):
 *  1. customUrl argument (for tests / special cases)
 *  2. VITE_SOCKET_URL  — explicit socket server override
 *  3. Derived from VITE_API_BASE_URL origin (handles cross-domain production
 *     where frontend is on Vercel/Netlify and backend is on Render/Railway)
 *  4. window.location.origin — same-origin dev fallback
 */
export function getSocket(customUrl) {
  if (!socketInstance) {
    let socketUrl;
    if (customUrl) {
      socketUrl = customUrl;
    } else if (import.meta.env.VITE_SOCKET_URL) {
      socketUrl = import.meta.env.VITE_SOCKET_URL;
    } else if (import.meta.env.VITE_API_BASE_URL) {
      // Strip the /api/v1 path to get the origin of the backend server
      try {
        const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL, window.location.origin);
        socketUrl = apiUrl.origin;
      } catch {
        socketUrl = window.location.origin;
      }
    } else {
      socketUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000';
    }

    socketInstance = io(socketUrl, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: socketAccessToken ? { accessToken: socketAccessToken } : {},
    });
  }
  return socketInstance;
}

export function setSocketAccessToken(accessToken) {
  const nextToken = accessToken || null;
  if (nextToken === socketAccessToken) return;
  socketAccessToken = nextToken;
  if (!socketInstance) return;

  socketInstance.auth = nextToken ? { ...(socketInstance.auth || {}), accessToken: nextToken } : {};
  if (socketInstance.connected) {
    socketInstance.disconnect();
    socketInstance.connect();
  }
}

export function closeSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  socketAccessToken = null;
}

/**
 * React hook to subscribe to a specific flight's WebSocket room.
 * Safely joins/leaves room, handles reconnects, and cleans up listeners.
 */
export function useFlightSocket({
  flightId,
  onFlightUpdated,
  onSeatsUpdated,
  onSeatWarning,
  enabled = true,
}) {
  const [connected, setConnected] = useState(false);
  const [lastWarning, setLastWarning] = useState(null);

  const onFlightUpdatedRef = useRef(onFlightUpdated);
  onFlightUpdatedRef.current = onFlightUpdated;

  const onSeatsUpdatedRef = useRef(onSeatsUpdated);
  onSeatsUpdatedRef.current = onSeatsUpdated;

  const onSeatWarningRef = useRef(onSeatWarning);
  onSeatWarningRef.current = onSeatWarning;

  useEffect(() => {
    if (!enabled || !flightId) {
      return undefined;
    }

    const socket = getSocket();
    const id = Number(flightId);

    const handleConnect = () => {
      setConnected(true);
      socket.emit('join_flight', id);
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleFlightUpdated = (data) => {
      if (data && (Number(data.flight_id) === id || Number(data.id) === id)) {
        onFlightUpdatedRef.current?.(data);
      }
    };

    const handleSeatsUpdated = (data) => {
      if (data && Number(data.flight_id) === id) {
        onSeatsUpdatedRef.current?.(data);
      }
    };

    const handleSeatWarning = (data) => {
      if (data && (Number(data.flightId) === id || Number(data.flight_id) === id)) {
        setLastWarning(data);
        onSeatWarningRef.current?.(data);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('flight_updated', handleFlightUpdated);
    socket.on('flight_seats_updated', handleSeatsUpdated);
    socket.on('seat-warning', handleSeatWarning);

    if (socket.connected) {
      setConnected(true);
      socket.emit('join_flight', id);
    } else {
      socket.connect();
    }

    return () => {
      socket.emit('leave_flight', id);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('flight_updated', handleFlightUpdated);
      socket.off('flight_seats_updated', handleSeatsUpdated);
      socket.off('seat-warning', handleSeatWarning);
    };
  }, [enabled, flightId]);

  return {
    connected,
    lastWarning,
    clearWarning: () => setLastWarning(null),
  };
}
