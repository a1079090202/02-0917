<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtM2 } from '../format';

const loading = ref(true);
const materials = ref<any[]>([]);
const orders = ref<any[]>([]);
const remnants = ref<any[]>([]);
const stats = ref<any>(null);

onMounted(async () => {
  const month = new Date().toISOString().slice(0, 7);
  [materials.value, orders.value, remnants.value, stats.value] = await Promise.all([
    api.materials(),
    api.orders(),
    api.remnants({ status: 'available' }),
    api.monthly(month),
  ]);
  loading.value = false;
});

const stockSheets = () => materials.value.reduce((s, m) => s + m.stock_sheets, 0);
const remnantArea = () => remnants.value.reduce((s, r) => s + r.area, 0);
const statusText: Record<string, string> = {
  pending: '待开料',
  in_cutting: '开料中',
  cut: '已开完',
  archived: '已归档',
};
</script>

<template>
  <div v-if="!loading">
    <h1 class="page-title">总览</h1>
    <p class="page-sub">今天 {{ new Date().toLocaleDateString('zh-CN') }}，开料先吃余料、再开整板。</p>

    <div class="cards">
      <div class="card">
        <div class="k">待开料订单</div>
        <div class="v">{{ orders.filter((o) => o.status === 'pending').length }}<small>单</small></div>
        <div class="sub">开料中 {{ orders.filter((o) => o.status === 'in_cutting').length }} 单</div>
      </div>
      <div class="card">
        <div class="k">整板库存</div>
        <div class="v">{{ stockSheets() }}<small>张</small></div>
        <div class="sub">{{ materials.length }} 种规格材质</div>
      </div>
      <div class="card">
        <div class="k">可用边角料</div>
        <div class="v">{{ remnants.length }}<small>块</small></div>
        <div class="sub">合计 {{ fmtM2(remnantArea()) }} m²</div>
      </div>
      <div class="card">
        <div class="k">本月新开整板</div>
        <div class="v">{{ stats?.whole_sheets_used ?? 0 }}<small>张</small></div>
        <div class="sub">
          复用余料 {{ stats?.remnant_consumes ?? 0 }} 块
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>最近订单</h2>
      <table>
        <thead>
          <tr>
            <th>订单号</th><th>客户</th><th>板材</th><th>状态</th>
            <th class="num">需求件数</th><th class="num">已开件数</th>
            <th class="num">已耗整板</th><th>版本</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders.slice(0, 8)" :key="o.id">
            <td><RouterLink :to="`/orders/${o.id}`">{{ o.code }}</RouterLink></td>
            <td>{{ o.customer }}</td>
            <td>{{ o.spec_code }}</td>
            <td><span class="badge" :class="o.status">{{ statusText[o.status] }}</span></td>
            <td class="num">{{ o.total_qty }}</td>
            <td class="num">{{ o.cut_total_qty }}</td>
            <td class="num">{{ o.sheets_used }}</td>
            <td>v{{ o.version }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
