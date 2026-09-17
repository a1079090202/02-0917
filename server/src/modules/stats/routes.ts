import type { FastifyInstance } from 'fastify';
import type { DB } from '../../db';
import { currentMonth } from '../../core/time';
import { remnantLedger, utilization } from './service';

/** 月末统计：利用率（两个口径）+ 余料复用台账月结 */
export function registerStatsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/stats/utilization', (req) => {
    const q = req.query as { month?: string };
    return utilization(db, q.month || currentMonth());
  });

  app.get('/api/stats/remnants', (req) => {
    const q = req.query as { month?: string };
    return remnantLedger(db, q.month || currentMonth());
  });
}
