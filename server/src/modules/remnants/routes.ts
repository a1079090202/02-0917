import type { FastifyInstance } from 'fastify';
import type { DB } from '../../db';
import { badRequest } from '../../core/errors';
import { listRemnants, updateLocation } from './service';

/** 余料复用台账 */
export function registerRemnantsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/remnants', (req) => {
    const q = req.query as { status?: string; spec_id?: string };
    return listRemnants(db, {
      status: q.status || undefined,
      spec_id: q.spec_id ? Number(q.spec_id) : undefined,
    });
  });

  app.patch('/api/remnants/:id', (req) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) throw badRequest('余料编号无效');
    return updateLocation(db, id, req.body);
  });
}
