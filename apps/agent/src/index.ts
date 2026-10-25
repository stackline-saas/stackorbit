import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import { WebSocket } from 'ws';

// CLI / Env arguments parser
function getArg(flag: string, envVar: string, fallback: string = ''): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return process.env[envVar] || fallback;
}

const managerUrl = getArg('--manager', 'MANAGER_WS_URL', 'ws://localhost:3000/ws/agent');
const agentToken = getArg('--token', 'AGENT_TOKEN', '');
const defaultSocket = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
const dockerSocket = getArg('--socket', 'DOCKER_SOCKET_PATH', defaultSocket);

if (!agentToken) {
  console.error('❌ ERRO: Token do agente não informado.');
  console.error('Uso: npx tsx apps/agent/src/index.ts --manager <WS_URL> --token <TOKEN>');
  console.error('Ou defina as variáveis de ambiente MANAGER_WS_URL e AGENT_TOKEN.');
  process.exit(1);
}

console.log('==================================================');
console.log('🚀 StackOrbit - Edge Agent');
console.log(`📡 Manager URL: ${managerUrl}`);
console.log(`🐳 Docker Socket: ${dockerSocket}`);
console.log('==================================================\n');

// Active local streams bridged to Docker socket
const activeStreams = new Map<string, net.Socket>();

/**
 * Consulta informações locais do Docker através do socket Unix/Pipe
 */
async function fetchDockerInfo(): Promise<{ dockerVersion?: string; osInfo?: string; containersCount?: number }> {
  return new Promise((resolve) => {
    const opts: http.RequestOptions = {
      socketPath: dockerSocket,
      path: '/info',
      method: 'GET',
    };

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          resolve({
            dockerVersion: info.ServerVersion,
            osInfo: `${info.OperatingSystem || ''} (${info.Architecture || ''})`.trim(),
            containersCount: info.Containers || 0,
          });
        } catch {
          resolve({});
        }
      });
    });

    req.on('error', () => resolve({}));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve({});
    });
    req.end();
  });
}

let ws: WebSocket | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

function connect() {
  const wsEndpoint = new URL(managerUrl);
  wsEndpoint.searchParams.set('token', agentToken);

  console.log(`Connecting to ${wsEndpoint.origin}${wsEndpoint.pathname}...`);
  ws = new WebSocket(wsEndpoint.toString());

  ws.on('open', async () => {
    console.log('✅ Conectado com sucesso ao Manager!');

    // Envia o primeiro heartbeat imediatamente
    await sendHeartbeat();

    // Inicia intervalo de heartbeat a cada 10s
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(sendHeartbeat, 10000);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'ready':
          console.log(`🎯 Agente autenticado e pronto para receber comandos.`);
          break;

        case 'stream_open':
          handleStreamOpen(msg.streamId);
          break;

        case 'stream_data':
          if (msg.streamId && activeStreams.has(msg.streamId)) {
            const socket = activeStreams.get(msg.streamId)!;
            socket.write(Buffer.from(msg.chunk, 'base64'));
          }
          break;

        case 'stream_close':
          if (msg.streamId && activeStreams.has(msg.streamId)) {
            const socket = activeStreams.get(msg.streamId)!;
            socket.end();
            activeStreams.delete(msg.streamId);
          }
          break;
      }
    } catch (e: any) {
      console.warn('Erro ao processar mensagem do Manager:', e.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.warn(`⚠️ Conexão perdida (${code} - ${reason.toString() || 'sem motivo'}). Reconectando em 5 segundos...`);
    cleanup();
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('Erro no WebSocket:', err.message);
  });
}

async function sendHeartbeat() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const info = await fetchDockerInfo();
  ws.send(
    JSON.stringify({
      type: 'heartbeat',
      metrics: {
        ...info,
      },
    })
  );
}

function handleStreamOpen(streamId: string) {
  // Conecta ao socket local do Docker
  const dockerConn = net.createConnection(dockerSocket, () => {
    activeStreams.set(streamId, dockerConn);
  });

  dockerConn.on('data', (chunk) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'stream_data',
          streamId,
          chunk: chunk.toString('base64'),
        })
      );
    }
  });

  dockerConn.on('close', () => {
    activeStreams.delete(streamId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stream_close', streamId }));
    }
  });

  dockerConn.on('error', (err) => {
    activeStreams.delete(streamId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stream_error', streamId, error: err.message }));
    }
  });
}

function cleanup() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  for (const [, socket] of activeStreams) {
    try {
      socket.destroy();
    } catch {}
  }
  activeStreams.clear();
}

// Inicia conexão
connect();

process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando Edge Agent...');
  cleanup();
  if (ws) ws.close();
  process.exit(0);
});
