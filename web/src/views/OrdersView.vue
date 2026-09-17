<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

const orders = ref<any[]>([]);
const filter = ref('');
const statusText: Record<string, string> = {
  pending: '待开料',
  in_cutting: '开料中',
  cut: '已开完',
  archived: '已归档',
};

async function load() {
  orders.value = await api.orders();
}
onMounted(load);

const shown = () =>
  orders.value.filter(
    (o) =>
      !filter.value ||
      o.code.includes(filter.value) ||
      o.customer.includes(filter.value),
  );
</script>

<template>
  <div class="toolbar">
    <h1 class="page-title" style="margin:0;flex:1">订单与套裁</h1>
    <input v-model="filter" placeholder="搜订单号 / 客户" style="width:200px" />
    <RouterLink class="btn" to="/orders/new">+ 新建订单</RouterLink>
  </div>

  <div class="panel">
    <table>
      <thead>
        <tr>
          <th>订单号</th><th>客户</th><th>板材规格</th><th>状态</th><th>版本</th>
          <th class="num">需求/已开(件)</th>
          <th class="num">已耗整板(张)</th>
          <th>下单时间</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in shown()" :key="o.id">
          <td><RouterLink :to="`/orders/${o.id}`"><strong>{{ o.code }}</strong></RouterLink></td>
          <td>{{ o.customer }}</td>
          <td class="mono">{{ o.spec_code }}</td>
          <td><span class="badge" :class="o.status">{{ statusText[o.status] }}</span></td>
          <td>v{{ o.version }}</td>
          <td class="num">{{ o.total_qty }} / {{ o.cut_total_qty }}</td>
          <td class="num">{{ o.sheets_used }}</td>
          <td class="muted">{{ o.created_at }}</td>
          <td><RouterLink class="btn ghost" :to="`/orders/${o.id}`">打开</RouterLink></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
