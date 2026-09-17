import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { db } from './db.js';
import * as planning from './modules/planning.js';
import * as remnants from './modules/remnants.js';
import * as changes from './modules/changes.js';
import * as stats from './modules/stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3210);

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  // ---------- 板材台账 ----------
  app.get('/api/materials', async () =>
    db().prepare('SELECT * FROM materials ORDER BY id').all(),
  );

  app.post('/api/materials', async (req, reply) => {
    const b = req.body as any;
    for (const k of ['code', 'name', 'length', 'width', 'thickness']) {
      if (b[k] === undefined || b[k] === null || b[k] === '') {
        return reply.code(400).send({ error: `字段 ${k} 必填` });
      }
    }
    for (const k of ['length', 'width', 'thickness']) {
      b[k] = Math.trunc(Number(b[k]));
      if (b[k] <= 0) return reply.code(400).send({ error: `${k} 必须为正整数` });
    }
    b.stock_sheets = Math.max(0, Math.trunc(Number(b.stock_sheets || 0)));
    b.unit_price = Math.max(0, Math.trunc(Number(b.unit_price || 0)));
    try {
      const info = db()
        .prepare(
          'INSERT INTO materials (code,name,length,width,thickness,stock_sheets,unit_price) VALUES (?,?,?,?,?,?,?)',
        )
        .run(b.code, b.name, b.length, b.width, b.thickness, b.stock_sheets, b.unit_price);
      return { id: Number(info.lastInsertRowid) };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/api/materials/:id/restock', async (req, reply) => {
    const id = Number((req.params as any).id);
    const n = Math.trunc(Number((req.body as any).qty));
    if (!Number.isInteger(n) || n === 0) {
      return reply.code(400).send({ error: '入库数量必须为非零整数' });
    }
    const info = db()
      .prepare('UPDATE materials SET stock_sheets = stock_sheets + ? WHERE id=?')
      .run(n, id);
    if (info.changes === 0) return reply.code(404).send({ error: '规格不存在' });
    return { ok: true };
  });

  // ---------- 订单 ----------
  app.get('/api/orders', async () => planning.listOrders());

  app.post('/api/orders', async (req, reply) => {
    try {
      const id = planning.createOrder(req.body as any);
      return { id };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/api/orders/:id', async (req, reply) => {
    try {
      return planning.orderDetail(Number((req.params as any).id));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // 套裁方案预览（不扣库存）
  app.post('/api/orders/:id/preview', async (req, reply) => {
    try {
      return planning.previewPlan(Number((req.params as any).id));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // 确认开料：吃余料/扣整板/登记新余料/回写 cut_qty
  app.post('/api/orders/:id/cut', async (req, reply) => {
    try {
      return planning.commitCut(Number((req.params as any).id));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ---------- 变更单 ----------
  app.post('/api/orders/:id/changes', async (req, reply) => {
    try {
      return changes.applyChange(Number((req.params as any).id), req.body as any);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/api/changes', async () => changes.listChanges());

  // ---------- 余料台账 ----------
  app.get('/api/remnants', async (req) => {
    const q = req.query as any;
    return remnants.listRemnants({
      spec_id: q.spec_id ? Number(q.spec_id) : undefined,
      status: q.status,
      location: q.location,
    });
  });

  app.get('/api/remnants/summary', async () => remnants.remnantSummary());

  app.post('/api/remnants/match', async (req, reply) => {
    try {
      const b = req.body as any;
      const parts = (b.parts ?? []).map((p: any) => ({
        demand_id: p.demand_id ?? 0,
        name: String(p.name),
        l: Math.trunc(Number(p.length ?? p.l)),
        w: Math.trunc(Number(p.width ?? p.w)),
      }));
      if (!parts.length) return reply.code(400).send({ error: 'parts 不能为空' });
      return remnants.matchRemnants(Number(b.spec_id), parts);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ---------- 月末统计 ----------
  app.get('/api/stats/monthly', async (req) => {
    const q = req.query as any;
    const month = q.month || new Date().toISOString().slice(0, 7);
    return stats.monthlyStats(month);
  });

  app.get('/api/stats/months', async () => stats.monthlyStatsRows());

  app.get('/api/stats/by-spec', async (req) => {
    const q = req.query as any;
    const month = q.month || new Date().toISOString().slice(0, 7);
    return stats.monthlyStatsBySpec(month);
  });

  // ---------- 生产模式：托管前端构建产物 ----------
  const dist = resolve(__dirname, '../../web/dist');
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if ((req.url as string).startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  db(); // 启动即建库
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
