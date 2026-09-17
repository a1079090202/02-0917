import { createRouter, createWebHistory } from 'vue-router';
import BoardsView from './views/BoardsView.vue';
import OrdersView from './views/OrdersView.vue';
import OrderDetailView from './views/OrderDetailView.vue';
import RemnantsView from './views/RemnantsView.vue';
import ChangesView from './views/ChangesView.vue';
import StatsView from './views/StatsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/orders' },
    { path: '/boards', component: BoardsView, meta: { title: '板材台账' } },
    { path: '/orders', component: OrdersView, meta: { title: '订单管理' } },
    { path: '/orders/:id', component: OrderDetailView, meta: { title: '订单详情' } },
    { path: '/remnants', component: RemnantsView, meta: { title: '余料台账' } },
    { path: '/changes', component: ChangesView, meta: { title: '变更记录' } },
    { path: '/stats', component: StatsView, meta: { title: '月末统计' } },
  ],
});
