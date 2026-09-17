<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import type { ChangeOrder } from '../types';

const router = useRouter();
const changes = ref<ChangeOrder[]>([]);
const error = ref('');

onMounted(async () => {
  try {
    changes.value = await api.listChanges();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function deltaText(c: ChangeOrder): string {
  const parts: string[] = [];
  for (const a of c.deltas.added) parts.push(`＋${a.part_name} ${a.length_mm}×${a.width_mm}×${a.quantity}`);
  for (const r of c.deltas.reduced) parts.push(`－${r.part_name} ${r.from}→${r.to}`);
  return parts.join('；');
}
</script>

<template>
  <h1>变更记录</h1>
  <p class="page-desc">所有订单变更留痕：改了什么、耗板数前后对比、重算出的方案版本。</p>

  <div v-if="error" class="alert error">{{ error }}</div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>#</th><th>时间</th><th>订单</th><th>客户</th><th>原因</th><th>变更内容</th>
          <th class="num">整板 前→后</th><th class="num">余料 前→后</th><th>新方案</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in changes" :key="c.id">
          <td class="muted">{{ c.id }}</td>
          <td class="muted">{{ c.created_at }}</td>
          <td class="mono"><b>{{ c.order_code }}</b></td>
          <td>{{ c.customer }}</td>
          <td>{{ c.reason || '—' }}</td>
          <td>{{ deltaText(c) }}</td>
          <td class="num mono">{{ c.boards_before }} → {{ c.boards_after }} 张</td>
          <td class="num mono">{{ c.remnants_before }} → {{ c.remnants_after }} 块</td>
          <td>{{ c.plan_version_after ? `v${c.plan_version_after}` : '—' }}</td>
          <td><button class="small" @click="router.push(`/orders/${c.order_id}`)">看订单</button></td>
        </tr>
        <tr v-if="!changes.length"><td colspan="10" class="muted">暂无变更记录</td></tr>
      </tbody>
    </table>
  </div>
</template>
