import type { FastifyInstance } from 'fastify';
import type { DB } from '../../db';
import { createSpec, listSpecs } from './service';

/** 板材台账 */
export function registerBoardsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/boards', () => listSpecs(db));

  app.post('/api/boards', (req) => createSpec(db, req.body));
}
