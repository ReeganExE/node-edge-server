import { createServer } from 'node:http';
import { Readable, Transform, Writable } from 'node:stream';
import * as zlib from 'node:zlib';

import type * as http from 'node:http';
import type { AddressInfo } from 'node:net';

type OnListen = (info: AddressInfo) => void;

export function serve(fetchHandler: FetchHandler): http.Server;
export function serve(fetchHandler: FetchHandler, onListen: OnListen): http.Server;
export function serve(fetchHandler: FetchHandler, port: number): http.Server;
export function serve(fetchHandler: FetchHandler, port: number, onListen: OnListen): http.Server;
export function serve(fetchHandler: FetchHandler, options: ServerOptions): http.Server;
export function serve(fetchHandler: FetchHandler, options: ServerOptions, onListen: OnListen): http.Server;
export function serve(
  fetchHandler: FetchHandler,
  options?: OnListen | ServerOptions | number,
  onListen?: OnListen
): http.Server {
  let listenerCallback: OnListen | undefined = onListen;
  let opt: ServerOptions = {};
  if (options) {
    if (typeof options === 'function') {
      listenerCallback = options;
    } else if (typeof options === 'number') {
      opt = { port: options };
    } else {
      opt = options;
    }
  }

  const server = createServer(createRequestListener(fetchHandler));
  server.listen(opt?.port ?? 3000, opt.hostname ?? '0.0.0.0', () => {
    listenerCallback && listenerCallback(server.address() as AddressInfo);
  });

  if (opt.signal) {
    opt.signal.addEventListener('abort', () => server.close(), { once: true });
  }
  return server;
}

export function createRequestListener(fetchHandler: FetchHandler) {
  return async function (req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method || 'GET';
    // @ts-expect-error encrypted is only defined in tls.TLSSocket
    const protocol = req.socket.encrypted ? 'https' : 'http';
    const origin = `${protocol}://${req.headers.host ?? 'localhost'}`;
    const url = new URL(req.url ?? '', origin);

    const init = {
      method,
      headers: headersFromIncomingRequest(req),
    } as RequestInit;

    if (!(method === 'GET' || method === 'HEAD')) {
      // lazy-consume request body
      init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
      // node 18 fetch needs half duplex mode when request body is stream
      (init as any).duplex = 'half';
    }

    let response: Response;

    try {
      const request = new Request(url.toString(), init);
      response = await fetchHandler(request);
    } catch (e: unknown) {
      console.error(e);
      response = new Response(null, { status: 500 });
      if (e instanceof Error) {
        // timeout error emits 504 timeout
        if (e.name === 'TimeoutError' || e.constructor.name === 'TimeoutError') {
          response = new Response(null, { status: 504 });
        } else {
          response = new Response(e.stack, { status: 500 });
        }
      }
    }

    try {
      await writeResponse(response, res);
    } catch (e: unknown) {
      console.error(e);
      const err = e instanceof Error ? e : new Error('unknown error', { cause: e });
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end(err.stack, 'utf8');
    }
  };
}

// Reverse of https://github.com/cloudflare/miniflare/blob/7e4d906e19cc69cd3446512bfeb7f8aee3a2bda7/packages/http-server/src/index.ts#L135
async function writeResponse(response: Response, res: http.ServerResponse) {
  const headers: http.OutgoingHttpHeaders = {};
  // eslint-disable-next-line prefer-const
  for (let [key, value] of response.headers) {
    key = key.toLowerCase();
    if (key === 'set-cookie') {
      // Multiple Set-Cookie headers should be treated as separate headers
      // @ts-expect-error getAll is added to the Headers prototype by
      // importing @miniflare/core
      headers['set-cookie'] = response.headers.getAll('set-cookie');
    } else if (key !== 'content-length') {
      // Content-Length has special handling below
      headers[key] = value;
    }
  }

  // Use body's actual length instead of the Content-Length header if set,
  // see https://github.com/cloudflare/miniflare/issues/148. We also might
  // need to adjust this later for live reloading so hold onto it.
  const contentLengthHeader = response.headers.get('Content-Length');
  const contentLength = contentLengthHeader === null ? null : parseInt(contentLengthHeader, 10);
  if (contentLength !== null && !Number.isNaN(contentLength)) {
    headers['content-length'] = contentLength;
  }

  // If a Content-Encoding is set, and the user hasn't encoded the body,
  // we're responsible for doing so.
  const encoders: Transform[] = [];
  if (headers['content-encoding']) {
    // Reverse of https://github.com/nodejs/undici/blob/48d9578f431cbbd6e74f77455ba92184f57096cf/lib/fetch/index.js#L1660
    const codings = headers['content-encoding']
      .toString()
      .toLowerCase()
      .split(',')
      .map((x) => x.trim());
    for (const coding of codings) {
      if (/(x-)?gzip/.test(coding)) {
        encoders.push(zlib.createGzip());
      } else if (/(x-)?deflate/.test(coding)) {
        encoders.push(zlib.createDeflate());
      } else if (coding === 'br') {
        encoders.push(zlib.createBrotliCompress());
      } else {
        // Unknown encoding, don't do any encoding at all
        encoders.length = 0;
        break;
      }
    }
    if (encoders.length > 0) {
      // Content-Length will be wrong as it's for the decoded length
      delete headers['content-length'];
    }
  }

  res.writeHead(response.status, headers);

  // `initialStream` is the stream we'll write the response to. It
  // should end up as the first encoder, piping to the next encoder,
  // and finally piping to the response:
  //
  // encoders[0] (initialStream) -> encoders[1] -> res
  //
  // Not using `pipeline(passThrough, ...encoders, res)` here as that
  // gives a premature close error with server sent events. This also
  // avoids creating an extra stream even when we're not encoding.
  let initialStream: Writable = res;
  for (let i = encoders.length - 1; i >= 0; i--) {
    encoders[i].pipe(initialStream);
    initialStream = encoders[i];
  }

  // Response body may be null if empty
  if (response.body) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    for await (const chunk of response.body) {
      if (chunk) initialStream.write(chunk);
    }
  }

  initialStream.end();
}

// https://github.com/cloudflare/miniflare/blob/7e4d906e19cc69cd3446512bfeb7f8aee3a2bda7/packages/core/src/standards/http.ts#L121
function headersFromIncomingRequest(req: http.IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, values] of Object.entries(req.headers)) {
    // These headers are unsupported in undici fetch requests, they're added
    // automatically
    if (name === 'transfer-encoding' || name === 'connection' || name === 'keep-alive' || name === 'expect') {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (Array.isArray(values)) {
      for (const value of values) headers.append(name, value);
    } else if (values !== undefined) {
      headers.append(name, values);
    }
  }
  return headers;
}

export interface FetchHandler {
  (request: Request): Promise<Response> | Response;
}

interface ServerOptions {
  port?: number;
  hostname?: string;
  signal?: AbortSignal;
}
