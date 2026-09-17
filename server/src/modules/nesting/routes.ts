import type { FastifyInstance } from 'fastify';
import type { DB } from '../../db';
import { badRequest } from '../../core/errors';
import { executePlan, generatePlan, getPlan, listPlans } from './service';

/** 套裁方案 */
export function registerNestingRoutes(app: FastifyInstance, db: DB): void {
  // 为订单生成套裁方案（草稿）
  app.post('/api/orders/:id/plans', (req) => {
    const orderId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(orderId)) throw badRequest('订单编号无效');
    const body = (req.body ?? {}) as { allowRotation?: boolean; kerf?: number };
    return generatePlan(db, orderId, {
      allowRotation: body.allowRotation ?? false,
      kerf: body.kerf ?? 0,
    });
  });

  app.get('/api/orders/:id/plans', (req) => {
    const orderId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(orderId)) throw badRequest('订单编号无效');
    return listPlans(db, orderId);
  });

  app.get('/api/plans/:id', (req) => {
    const planId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(planId)) throw badRequest('方案编号无效');
    return getPlan(db, planId);
  });

  // 确认开料
  app.post('/api/plans/:id/execute', (req) => {
    const planId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(planId)) throw badRequest('方案编号无效');
    return executePlan(db, planId);
  });
}
