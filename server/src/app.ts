import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { DB } from './db';
import { HttpError } from './core/errors';
import { registerBoardsRoutes } from './modules/boards/routes';
import { registerOrdersRoutes } from './modules/orders/routes';
import { registerNestingRoutes } from './modules/nesting/routes';
import { registerRemnantsRoutes } from './modules/remnants/routes';
import { registerChangesRoutes } from './modules/changes/routes';
import { registerStatsRoutes } from './modules/stats/routes';

export function buildApp(db: DB) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  // 容忍空 JSON body（如 POST execute 不带参数）
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined || body === null) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new HttpError(400, '请求体不是合法 JSON'));
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    return reply.code(500).send({ error: `服务器内部错误：${err.message}` });
  });

  app.get('/api/health', () => ({ ok: true }));

  registerBoardsRoutes(app, db);
  registerOrdersRoutes(app, db);
  registerNestingRoutes(app, db);
  registerRemnantsRoutes(app, db);
  registerChangesRoutes(app, db);
  registerStatsRoutes(app, db);

  return app;
}
