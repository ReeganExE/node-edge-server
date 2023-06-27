# Edge Server Adapter for Node.js

> 🚀 Simple, Lightweight

This adapter allows you to run your Worker application on Node.js. It utilizes web standard APIs implemented in Node.js version 18 or higher.

You can now share the same code between Edge Workers and Node.js. No more express.

> Required Node.js 18 or higher.

## Install

```
npm install node-edge-server
```

Supported both CommonJS and ESM.

## Usage

```ts
import { serve } from 'node-edge-server'

async function handler(req: Request) {
  return new Response('200 OK')
}

serve(handler, (info) => {
  console.log(`Listening on http://127.0.0.1:${info.port}`) // Listening on http://127.0.0.1:3000
})
```

Run it then open `http://127.0.0.1:3000`.

> **Note**
> KV, DO, or any specific to cloud provider is not included. You should handle it yourself.

## Options

```ts
interface ServerOptions {
  port?: number;        // default 3000
  hostname?: string;    // default 0.0.0.0
  signal?: AbortSignal; // signal to close the server
};
```

### `port`

```ts
serve(handler, 3000, (info) => {
  console.log(`Listening on http://127.0.0.1:${info.port}`)
})
```

### `https`

```ts
import https from 'node:https'
import fs from 'node:fs'

import { createRequestListener } from 'node-edge-server'

async function handler(req: Request) {
  return new Response('200 OK')
}

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, createRequestListener(handler)).listen(8443);
```


## API

### `serve(fetchHandler: FetchHandler)`

`serve` serves your handler on the Node.js HTTP server.

```ts
serve(fetchHandler: FetchHandler): http.Server;
serve(fetchHandler: FetchHandler, onListen: OnListen): http.Server;

serve(fetchHandler: FetchHandler, port: number): http.Server;
serve(fetchHandler: FetchHandler, port: number, onListen: OnListen): http.Server;

serve(fetchHandler: FetchHandler, options: ServerOptions): http.Server;
serve(fetchHandler: FetchHandler, options: ServerOptions, onListen: OnListen): http.Server;
```


### `createRequestListener(fetchHandler: FetchHandler)`

`createRequestListener` wraps your handler and returns a Node.js HTTP request listener that can be passed to `https.createServer` or express route.

### Streaming

This also supports media streaming. Thank to `fetch`.

See [examples/video.mjs](examples/video.mjs)

## Author
- Ninh Pham <https://github.com/ReeganExE>
- Yusuke Wada <https://github.com/yusukebe>

### Credit
- Cloudflare <https://github.com/cloudflare>
- Yusuke Wada <https://github.com/yusukebe>

## License

MIT
