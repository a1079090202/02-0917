<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtAreaFull, fmtDims } from '../format';
import type { BoardSpec, Remnant } from '../types';

const remnants = ref<Remnant[]>([]);
const specs = ref<BoardSpec[]>([]);
const error = ref('');
const statusFilter = ref('');
const specFilter = ref<number | ''>('');
const editingLocation = ref<Record<number, string>>({});

const summary = computed(() => {
  const avail = remnants.value.filter((r) => r.status === 'available');
  return {
    count: avail.length,
    area: avail.reduce((s, r) => s + r.area_mm2, 0),
  };
});

async function load() {
  error.value = '';
  try {
    remnants.value = await api.listRemnants({
      status: statusFilter.value || undefined,
      spec_id: specFilter.value === '' ? undefined : specFilter.value,
    });
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onMounted(async () => {
  try {
    specs.value = await api.listBoards();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function saveLocation(r: Remnant) {
  try {
    await api.updateRemnantLocation(r.id, editingLocation.value[r.id] ?? r.location);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <h1>余料复用台账</h1>
  <p class="page-desc">切下来的边角料按规格和位置登记；新订单开料时优先吃这里的余料。</p>

  <div v-if="error" class="alert error">{{ error }}</div>

  <div class="card">
    <div class="toolbar">
      <label class="muted">状态</label>
      <select v-model="statusFilter" @change="load">
        <option value="">全部</option>
        <option value="available">可用</option>
        <option value="consumed">已耗用</option>
      </select>
      <label class="muted">规格</label>
      <select v-model="specFilter" @change="load">
        <option value="">全部</option>
        <option v-for="s in specs" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <span class="spacer"></span>
      <span class="muted">当前可用 <b class="mono">{{ summary.count }}</b> 块 / {{ fmtAreaFull(summary.area) }}</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th><th>规格</th><th>尺寸(mm)</th><th>面积</th><th>来源</th>
          <th>存放位置</th><th>状态</th><th>登记时间</th><th>耗用时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in remnants" :key="r.id">
          <td class="muted">{{ r.id }}</td>
          <td>{{ r.spec_name }}</td>
          <td class="mono">{{ fmtDims(r.length_mm, r.width_mm) }}</td>
          <td>{{ fmtAreaFull(r.area_mm2) }}</td>
          <td>
            <span v-if="r.source === 'initial'">期初库存</span>
            <span v-else>{{ r.source_order_code ?? '—' }}<span class="muted">（方案 #{{ r.source_plan_id }}）</span></span>
          </td>
          <td>
            <template v-if="r.status === 'available'">
              <input
                v-model="editingLocation[r.id]"
                :placeholder="r.location || '未登记'"
                style="width: 90px; padding: 3px 8px"
              />
              <button class="small" @click="saveLocation(r)">存</button>
            </template>
            <span v-else class="muted">{{ r.location || '—' }}</span>
          </td>
          <td><span class="badge" :class="r.status">{{ r.status === 'available' ? '可用' : '已耗用' }}</span></td>
          <td class="muted">{{ r.created_at }}</td>
          <td class="muted">{{ r.consumed_at ?? '—' }}</td>
        </tr>
        <tr v-if="!remnants.length"><td colspan="9" class="muted">暂无记录</td></tr>
      </tbody>
    </table>
  </div>
</template>
