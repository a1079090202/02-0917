import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './styles.css';

import DashboardView from './views/DashboardView.vue';
import MaterialsView from './views/MaterialsView.vue';
import OrdersView from './views/OrdersView.vue';
import OrderDetailView from './views/OrderDetailView.vue';
import CreateOrderView from './views/CreateOrderView.vue';
import RemnantsView from './views/RemnantsView.vue';
import StatsView from './views/StatsView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/materials', component: MaterialsView },
    { path: '/remnants', component: RemnantsView },
    { path: '/orders', component: OrdersView },
    { path: '/orders/new', component: CreateOrderView },
    { path: '/orders/:id', component: OrderDetailView, props: true },
    { path: '/stats', component: StatsView },
  ],
});

createApp(App).use(router).mount('#app');
