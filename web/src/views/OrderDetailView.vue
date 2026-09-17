<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import { fmtDims, ORDER_STATUS } from '../format';
import type { AuditEntry, BoardSpec, ChangeOrder, OrderDetail } from '../types';
import PlanCard from '../components/PlanCard.vue';
import ChangeForm from '../components/ChangeForm.vue';

const route = useRoute();
const orderId = Number(route.params.id);

const detail = ref<OrderDetail | null>(null);
const specs = ref<BoardSpec[]>([]);
const audit = ref<AuditEntry[]>([]);
const error = ref('');
const notice = ref('');
const busy = ref(false);
const showChange = ref(false);

const allowRotation = ref(false);
const kerf = ref(0);

const hasUncut = computed(
  () => (detail.value?.items ?? []).some((i) => i.quantity - i.cut_quantity > 0),
);

async function load() {
  [detail.value, audit.value] = await Promise.all([api.getOrder(orderId), api.orderAudit(orderId)]);
}

onMounted(async () => {
  try {
    specs.value = await api.listBoards();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function generate() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const plan = await api.generatePlan(orderId, { allowRotation: allowRotation.value, kerf: kerf.value });
    notice.value = `方案 v${plan.version} 已生成：整板 ${plan.boards_new} 张、吃余料 ${plan.remnants_used} 块`;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function onExecuted() {
  notice.value = '开料完成：部件已入账，边角料已登记进余料台账';
  await load();
}

async function submitChange(payload: Parameters<typeof api.applyChange>[1]) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const { change, plan } = await api.applyChange(orderId, payload);
    notice.value =
      `变更单 #${change.id} 已入账：整板 ${change.boards_before} → ${change.boards_after} 张，` +
      `余料 ${change.remnants_before} → ${change.remnants_after} 块` +
      (plan ? `，已生成方案 v${plan.version}（待开料）` : '，无待开料部件');
    showChange.value = false;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function deltaText(c: ChangeOrder): string {
  const parts: string[] = [];
  for (const a of c.deltas.added) parts.push(`＋${a.part_name} ${a.length_mm}×${a.width_mm}×${a.quantity}`);
  for (const r of c.deltas.reduced) parts.push(`－${r.part_name} ${r.from}→${r.to}`);
  return parts.join('；');
}

function auditText(a: AuditEntry): string {
  const d = JSON.parse(a.detail_json) as Record<string, unknown>;
  switch (a.action) {
    case 'created': return `创建订单（${d.itemCount} 行部件）`;
    case 'generated': return `生成方案 v${d.version}：整板 ${d.boardsNew} 张、余料 ${d.remnantsUsed} 块`;
    case 'executed': return `方案 v${d.version} 开料完成，登记余料 ${d.registeredRemnants} 块`;
    case 'changed': return `变更单 #${d.changeId}：整板 ${(d.boardsBefore as { boards: number }).boards} → ${(d.boardsAfter as { boards: number }).boards} 张`;
    default: return a.action;
  }
}
</script>

<template>
  <template v-if="detail">
    <h1>
      {{ detail.order.code }}
      <span class="badge" :class="detail.order.status">{{ ORDER_STATUS[detail.order.status] }}</span>
    </h1>
    <p class="page-desc">
      客户：{{ detail.order.customer }}　备注：{{ detail.order.note || '—' }}　创建于 {{ detail.order.created_at }}
    </p>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert ok">{{ notice }}</div>

    <div class="card">
      <div class="card-title">
        <h2>开料需求</h2>
        <div class="form-row" style="margin: 0">
          <label><input v-model="allowRotation" type="checkbox" /> 允许旋转</label>
          <label>锯缝 <input v-model.number="kerf" type="number" min="0" max="20" style="width: 60px" /> mm</label>
          <button class="primary" :disabled="busy || !hasUncut" @click="generate">生成套裁方案</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>部件</th><th>板材规格</th><th>尺寸(mm)</th>
            <th class="num">数量</th><th class="num">已开料</th><th class="num">待开料</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in detail.items" :key="it.id">
            <td>{{ it.part_name }}</td>
            <td class="muted">{{ it.spec_name }}</td>
            <td class="mono">{{ fmtDims(it.length_mm, it.width_mm) }}</td>
            <td class="num mono">{{ it.quantity }}</td>
            <td class="num mono">{{ it.cut_quantity }}</td>
            <td class="num mono">
              <b v-if="it.quantity - it.cut_quantity > 0">{{ it.quantity - it.cut_quantity }}</b>
              <span v-else class="muted">0</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!hasUncut" class="muted" style="margin: 10px 0 0">全部部件已开完料。</p>
    </div>

    <PlanCard
      v-for="p in detail.plans"
      :key="p.id"
      :plan="p"
      @executed="onExecuted"
    />

    <div class="card">
      <div class="card-title">
        <h2>变更单（{{ detail.changes.length }}）</h2>
        <button @click="showChange = !showChange">{{ showChange ? '收起' : '✏️ 发起变更' }}</button>
      </div>
      <ChangeForm
        v-if="showChange"
        :items="detail.items"
        :specs="specs"
        :busy="busy"
        @submit="submitChange"
      />
      <table v-if="detail.changes.length">
        <thead>
          <tr>
            <th>#</th><th>时间</th><th>原因</th><th>内容</th>
            <th class="num">整板 前→后</th><th class="num">余料 前→后</th><th>新方案</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in detail.changes" :key="c.id">
            <td class="muted">{{ c.id }}</td>
            <td class="muted">{{ c.created_at }}</td>
            <td>{{ c.reason || '—' }}</td>
            <td>{{ deltaText(c) }}</td>
            <td class="num mono">{{ c.boards_before }} → {{ c.boards_after }} 张</td>
            <td class="num mono">{{ c.remnants_before }} → {{ c.remnants_after }} 块</td>
            <td>{{ c.plan_version_after ? `v${c.plan_version_after}` : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!showChange" class="muted" style="margin: 0">暂无变更。</p>
    </div>

    <div class="card">
      <h2>操作留痕</h2>
      <ul class="timeline">
        <li v-for="a in audit" :key="a.id">
          <span class="t-time mono">{{ a.created_at }}</span>{{ auditText(a) }}
        </li>
      </ul>
    </div>
  </template>
  <p v-else class="muted">加载中…</p>
</template>
