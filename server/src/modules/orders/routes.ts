import type { FastifyInstance } from 'fastify';
import type { DB } from '../../db';
import { badRequest } from '../../core/errors';
import { createOrder, getOrderDetail, listOrders, orderAudit } from './service';

/** 订单与开料需求 */
export function registerOrdersRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/orders', () => listOrders(db));

  app.post('/api/orders', (req) => createOrder(db, req.body));

  app.get('/api/orders/:id', (req) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) throw badRequest('订单编号无效');
    return getOrderDetail(db, id);
  });

  app.get('/api/orders/:id/audit', (req) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) throw badRequest('订单编号无效');
    return orderAudit(db, id);
  });
}
