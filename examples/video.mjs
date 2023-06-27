import { serve } from 'node-edge-server';

async function handler(req) {
  const u = new URL(req.url);
  if (u.pathname === '/favicon.ico') {
    return fetch('https://www.youtube.com/favicon.ico');
  }
  if (u.pathname === '/a.mp4') {
    // forwards bytes-range so that users can seek on video-player
    const h = new Headers(req.headers);
    h.delete('host');
    return fetch('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', { headers: h });
  }
  if (u.pathname === '/mac.png') {
    return fetch('https://photo2.tinhte.vn/data/attachment-files/2023/06/6477947_4GIX92oL.png');
  }
  if (u.pathname === '/a.json') {
    return fetch('https://jsonplaceholder.typicode.com/todos/1');
  }
  return new Response(JSON.stringify({ ngon: 'ok', ok: true }));
}

serve(handler, (info) => {
  console.log(`Listening on http://127.0.0.1:${info.port}`); // Listening on http://127.0.0.1:3000
});
