<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtAreaFull, fmtPct, PLAN_STATUS } from '../format';
import type { Plan } from '../types';
import BoardLayoutSvg from './BoardLayoutSvg.vue';

const props = defineProps<{ plan: Plan }>();
const emit = defineEmits<{ executed: [] }>();

const detail = ref<Plan | null>(null);
const loading = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    detail.value = await api.getPlan(props.plan.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function pct(parts: number, total: number): string {
  if (total <= 0) return '—';
  const p = Math.floor((parts * 10000) / total);
  return fmtPct(p);
}

async function execute() {
  if (!window.confirm(`确认按方案 v${props.plan.version} 开料？\n开料后部件数量与余料台账将正式入账，不可回退。`)) return;
  loading.value = true;
  error.value = '';
  try {
    await api.executePlan(props.plan.id);
    emit('executed');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-title">
      <h2>
        方案 v{{ plan.version }}
        <span class="badge" :class="plan.status">{{ PLAN_STATUS[plan.status] }}</span>
        <span v-if="plan.change_id" class="badge">变更单 #{{ plan.change_id }}</span>
      </h2>
      <button v-if="plan.status === 'draft'" class="primary" :disabled="loading" @click="execute">
        确认开料
      </button>
    </div>

    <div class="form-row" style="margin-bottom: 12px">
      <span>整板 <b class="mono">{{ plan.boards_new }}</b> 张</span>
      <span>吃余料 <b class="mono">{{ plan.remnants_used }}</b> 块</span>
      <span class="muted">部件面积 {{ fmtAreaFull(plan.parts_area) }}</span>
      <span v-if="detail && plan.new_board_area > 0" class="muted">
        整板利用率 {{ pct(detail.boards!.filter(b => b.source_type === 'new').reduce((s, b) => s + b.parts_area, 0), plan.new_board_area) }}
      </span>
      <span class="muted">{{ plan.created_at }}</span>
      <span v-if="plan.executed_at" class="muted">开料于 {{ plan.executed_at }}</span>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>

    <template v-if="detail?.boards">
      <div class="board-grid">
        <div v-for="b in detail.boards" :key="b.id" class="board-box">
          <BoardLayoutSvg
            :board-w="b.length_mm"
            :board-h="b.width_mm"
            :placements="b.layout.placements"
            :remnants="b.layout.remnants"
          />
          <div class="board-caption">
            <span>
              <b v-if="b.source_type === 'new'">整板 #{{ b.board_index }}</b>
              <b v-else>余料 #{{ b.remnant_id }}</b>
              {{ b.length_mm }}×{{ b.width_mm }}（{{ b.spec_name }}）
            </span>
            <span>利用率 {{ pct(b.parts_area, b.length_mm * b.width_mm) }}</span>
          </div>
        </div>
      </div>
      <div v-if="detail.boards.some(b => b.layout.remnants.length)" style="margin-top: 12px">
        <span class="muted" style="margin-right: 8px">
          {{ plan.status === 'executed' ? '已登记余料：' : '预计产生余料：' }}
        </span>
        <div class="pill-list" style="display: inline-flex">
          <template v-for="b in detail.boards" :key="b.id">
            <span v-for="(r, i) in b.layout.remnants" :key="i" class="pill">{{ r.w }}×{{ r.h }}</span>
          </template>
        </div>
      </div>
    </template>
    <div v-else-if="!error" class="muted">加载排版图…</div>
  </div>
</template>
