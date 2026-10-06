const http = require('http');

// Expose only VNPay's signed IPN callback to the public tunnel. Do not point
// ngrok directly at the full application server.
const allowedPath = '/api/payments/vnpay/ipn';
const backendOrigin = `http://127.0.0.1:${Number(process.env.PORT || 5000)}`;
const proxyPort = Number(process.env.VNPAY_IPN_PROXY_PORT || 5001);

const server = http.createServer(async (request, response) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url, 'http://127.0.0.1');
  } catch {
    response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ message: 'Invalid request URL.' }));
    return;
  }

  if (request.method !== 'GET' || requestUrl.pathname !== allowedPath || requestUrl.search.length > 8192) {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ message: 'Not found.' }));
    return;
  }

  try {
    const upstream = await fetch(`${backendOrigin}${allowedPath}${requestUrl.search}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const body = await upstream.arrayBuffer();
    response.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(Buffer.from(body));
  } catch {
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ message: 'VNPay callback service is unavailable.' }));
  }
});

server.listen(proxyPort, '127.0.0.1', () => {
  console.log(`VNPay IPN-only proxy listening on 127.0.0.1:${proxyPort}`);
});

