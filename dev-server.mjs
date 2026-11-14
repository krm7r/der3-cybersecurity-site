import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(repositoryRoot, 'site');
const assetsRoot = path.join(root, 'assets');
const pagesRoot = path.join(root, 'pages');
const routePaths = [
  '/', '/tools/links', '/tools/news', '/tools/messages', '/tools/phone',
  '/tools/password', '/tools/generator', '/tools/breach', '/tools/search',
  '/chat', '/quiz', '/history', '/reports', '/privacy', '/terms', '/about'
];
const pageRoutes = new Set(routePaths);
let routeManifest;
try {
  const source = await readFile(path.join(root, 'public/manus-routes.json'));
  const routes = JSON.parse(source.toString()).routes.map(route => route.path);
  if (JSON.stringify(routes) !== JSON.stringify(routePaths)) throw new Error('Route manifest is out of sync');
  routeManifest = source;
} catch {
  routeManifest = Buffer.from(JSON.stringify({ routes: routePaths.map(route => ({ path: route })) }));
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/manus-routes.json') {
      send(res, 200, routeManifest, mime['.json']);
      return;
    }
    if (pathname.startsWith('/pages/')) {
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(pagesRoot + path.sep) || path.extname(file) !== '.html') {
        send(res, 404, 'Not found');
        return;
      }
      try {
        send(res, 200, await readFile(file), mime['.html']);
      } catch {
        send(res, 404, 'Not found');
      }
      return;
    }
    if (pathname.startsWith('/assets/')) {
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(assetsRoot + path.sep)) {
        send(res, 404, 'Not found');
        return;
      }
      try {
        const body = await readFile(file);
        send(res, 200, body, mime[path.extname(file)] || 'application/octet-stream');
      } catch {
        send(res, 404, 'Not found');
      }
      return;
    }
    if (!pageRoutes.has(pathname)) {
      send(res, 404, 'Not found');
      return;
    }
    send(res, 200, await readFile(path.join(root, 'index.html')), mime['.html']);
  } catch {
    send(res, 400, 'Bad request');
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log(`Der3 static demo server listening on ${process.env.PORT || 3000}`);
});
