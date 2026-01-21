import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(userId, onMessage) {
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        if (!userId) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log('[WS] Connected');
            wsRef.current.send(JSON.stringify({ type: 'auth', userId }));
        };

        wsRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        wsRef.current.onclose = () => {
            console.log('[WS] Disconnected, reconnecting...');
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        wsRef.current.onerror = (err) => {
            console.error('[WS] Error:', err);
        };
    }, [userId, onMessage]);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        };
    }, [connect]);

    return wsRef;
}

export default useWebSocket;
