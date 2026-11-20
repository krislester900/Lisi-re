import http from 'node:http';
import { Readable } from 'node:stream';
import { createApiApp } from '../../server.ts';

let serverInfoPromise: Promise<{ port: number }> | null = null;

function getInternalServer(): Promise<{ port: number }> {
  if (!serverInfoPromise) {
    serverInfoPromise = new Promise((resolve, reject) => {
      const app = createApiApp();
      const server = http.createServer(app);
      server.unref();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('Impossible de démarrer le routeur interne Netlify.'));
          return;
        }
        resolve({ port: addr.port });
      });
    });
  }
  return serverInfoPromise;
}

export default async function handler(request: Request): Promise<Response> {
  const { port } = await getInternalServer();
  const url = new URL(request.url);
  const headers: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') return;
    headers[key] = value;
  });

  if (!headers['x-forwarded-host'] && url.host) {
    headers['x-forwarded-host'] = url.host;
  }
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = url.protocol.replace(':', '') || 'https';
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
  const bodyBuffer = hasBody ? Buffer.from(await request.arrayBuffer()) : null;
  if (bodyBuffer) {
    headers['content-length'] = String(bodyBuffer.byteLength);
  }

  return new Promise<Response>((resolve, reject) => {
    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers,
      },
      (proxyRes) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const entry of value) {
              responseHeaders.append(key, entry);
            }
          } else {
            responseHeaders.set(key, value);
          }
        }

        const status = proxyRes.statusCode ?? 200;
        const noBodyStatus = status === 204 || status === 304 || request.method === 'HEAD';
        if (noBodyStatus) {
          proxyRes.resume();
          resolve(new Response(null, { status, headers: responseHeaders }));
          return;
        }

        const webStream = Readable.toWeb(proxyRes) as unknown as ReadableStream<Uint8Array>;
        resolve(new Response(webStream, { status, headers: responseHeaders }));
      }
    );

    proxyReq.once('error', reject);

    if (request.signal) {
      request.signal.addEventListener(
        'abort',
        () => {
          proxyReq.destroy();
        },
        { once: true }
      );
    }

    if (bodyBuffer) {
      proxyReq.end(bodyBuffer);
    } else {
      proxyReq.end();
    }
  });
}
