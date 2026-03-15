const { WebSocketServer } = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const PORT = process.env.WS_PORT || 1234;
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

console.log(`Y-WebSocket server running on port ${PORT}`);
