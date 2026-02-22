import { useState, useCallback, useRef, useEffect } from 'react';

interface UseWebSocketReturn {
  isConnected: boolean;
  connect: (path: string) => void;
  disconnect: () => void;
  send: (data: ArrayBuffer | string) => void;
  lastMessage: MessageEvent | null;
  error: string | null;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 5;
  const pathRef = useRef<string>('');
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectInternal = useCallback((path: string) => {
    cleanup();

    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws${path}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        setLastMessage(event);
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        if (!intentionalCloseRef.current && retriesRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
          retriesRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            connectInternal(pathRef.current);
          }, delay);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create WebSocket');
      setIsConnected(false);
    }
  }, [cleanup]);

  const connect = useCallback(
    (path: string) => {
      pathRef.current = path;
      retriesRef.current = 0;
      connectInternal(path);
    },
    [connectInternal]
  );

  const disconnect = useCallback(() => {
    cleanup();
    intentionalCloseRef.current = true;
    retriesRef.current = maxRetries;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [cleanup]);

  const send = useCallback((data: ArrayBuffer | string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [cleanup]);

  return {
    isConnected,
    connect,
    disconnect,
    send,
    lastMessage,
    error,
  };
}
