import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

let socketInstance = null;

export function getSocket(customUrl) {
  if (!socketInstance) {
    const socketUrl = customUrl
      || import.meta.env.VITE_SOCKET_URL
      || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

    socketInstance = io(socketUrl, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return socketInstance;
}

export function closeSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
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
