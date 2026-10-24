import Docker from 'dockerode';
import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

let bridgeServer: net.Server | null = null;
let bridgePort: number | null = null;

export async function createDockerClient(): Promise<Docker> {
  const dockerHost = process.env.DOCKER_HOST;
  const socketPath = process.env.DOCKER_SOCKET_PATH;

  // 1. If explicit socket path or default /var/run/docker.sock exists (e.g. inside VPS container)
  if (socketPath && fs.existsSync(socketPath)) {
    return new Docker({ socketPath });
  }
  if (process.platform !== 'win32' && fs.existsSync('/var/run/docker.sock')) {
    return new Docker({ socketPath: '/var/run/docker.sock' });
  }

  // 2. If DOCKER_HOST starts with ssh://, bridge through docker system dial-stdio
  if (dockerHost && dockerHost.startsWith('ssh://')) {
    if (!bridgeServer) {
      const remoteDockerHost = dockerHost;
      delete process.env.DOCKER_HOST;

      bridgeServer = net.createServer((socket) => {
        const child = spawn('docker', ['system', 'dial-stdio'], {
          env: { ...process.env, DOCKER_HOST: remoteDockerHost },
          windowsHide: true,
        });
        socket.pipe(child.stdin);
        child.stdout.pipe(socket);
        child.on('error', (e) => socket.destroy(e));
        socket.on('error', () => child.kill());
        socket.on('close', () => child.kill());
      });

      await new Promise<void>((resolve, reject) => {
        bridgeServer!.listen(0, '127.0.0.1', () => {
          const addr = bridgeServer!.address() as net.AddressInfo;
          bridgePort = addr.port;
          console.log(`🔌 Worker Docker SSH Bridge ativo na porta 127.0.0.1:${bridgePort} (${remoteDockerHost})`);
          resolve();
        });
        bridgeServer!.on('error', reject);
      });
    }

    return new Docker({
      host: '127.0.0.1',
      port: bridgePort!,
    });
  }

  // 3. If DOCKER_HOST is tcp:// or http://
  if (dockerHost && (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://'))) {
    const url = new URL(dockerHost.replace('tcp://', 'http://'));
    return new Docker({
      host: url.hostname,
      port: Number(url.port) || 2375,
    });
  }

  // 4. Windows Named Pipe fallback
  if (process.platform === 'win32') {
    return new Docker({ socketPath: '//./pipe/docker_engine' });
  }

  return new Docker({ socketPath: '/var/run/docker.sock' });
}
