import { createDb } from './db';
import { seedIfEmpty } from './db/seed';
import { buildApp } from './app';

const db = createDb();
const seeded = seedIfEmpty(db);
const app = buildApp(db);

const port = Number(process.env.PORT ?? 3001);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    console.log(`板材套裁系统后端已启动：http://localhost:${port}`);
    if (seeded) console.log('首次启动，已写入演示数据（5 种板材、10 个订单、一批边角料）');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
