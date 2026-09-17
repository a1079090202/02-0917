import type { FastifyInstance } from 'fastify';
import type { DB } from '../../db';
import { badRequest } from '../../core/errors';
import { applyChange, listChanges } from './service';

/** 变更单 */
export function registerChangesRoutes(app: FastifyInstance, db: DB): void {
  // 发起变更（追加/减少未开料部件），自动重算方案
  app.post('/api/orders/:id/changes', (req) => {
    const orderId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(orderId)) throw badRequest('订单编号无效');
    return applyChange(db, orderId, (req.body ?? {}) as never);
  });

  app.get('/api/orders/:id/changes', (req) => {
    const orderId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(orderId)) throw badRequest('订单编号无效');
    return listChanges(db, orderId);
  });

  app.get('/api/changes', () => listChanges(db));
}
