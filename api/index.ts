import type { IncomingMessage, ServerResponse } from 'http';
import app from '../server';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.url) {
      const parsed = new URL(req.url, 'http://localhost');
      const rewrittenPath = parsed.searchParams.get('__kuro_path');
      if (rewrittenPath !== null) {
        parsed.searchParams.delete('__kuro_path');
        const cleanSubpath = rewrittenPath.replace(/^\/+/, '');
        const qs = parsed.searchParams.toString();
        req.url = `/api/${cleanSubpath}${qs ? `?${qs}` : ''}`;
      } else if (!parsed.pathname.startsWith('/api')) {
        const qs = parsed.searchParams.toString();
        req.url = `/api${parsed.pathname.startsWith('/') ? '' : '/'}${parsed.pathname}${qs ? `?${qs}` : ''}`;
      } else if (parsed.pathname === '/api' || parsed.pathname === '/api/') {
        req.url = '/api/health';
      }
    }
    return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Serverless API handler failure.';
    console.error('[Vercel Handler Error]', message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: message, message }));
    }
  }
}
