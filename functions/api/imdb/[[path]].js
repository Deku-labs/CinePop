// Cloudflare Pages Function: proxies IMDb's suggestion endpoint.
// Mounted at /api/imdb/* — mirrors the local server.py behavior.
//
//   /api/imdb/<letter>/<query>.json
//     -> https://v3.sg.media-imdb.com/suggestion/<letter>/<query>.json
//
// Adds Access-Control-Allow-Origin: * so the browser can read the response.
// Caches at the edge for 5 min to be a good neighbour to IMDb.

export async function onRequest(context) {
  const { request, params } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // params.path is an array of the remaining path segments after /api/imdb/
  const segs = Array.isArray(params.path) ? params.path : [params.path];
  // Light sanitization — only allow safe URL chars
  const safe = segs
    .map(s => String(s).replace(/[^a-zA-Z0-9._%+\- ]/g, ''))
    .filter(Boolean)
    .join('/');

  if (!safe) {
    return jsonError(400, 'Missing path');
  }

  const upstream = `https://v3.sg.media-imdb.com/suggestion/${safe}`;

  try {
    const res = await fetch(upstream, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/json',
      },
      // Cloudflare edge cache — 5 minutes
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err) {
    return jsonError(502, err.message || 'Upstream fetch failed');
  }
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
