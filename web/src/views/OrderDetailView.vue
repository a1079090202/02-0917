<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtM2, fmtPermille } from '../format';
import type { OrderDetail, NestingPlan } from '../types';
import BoardMap from '../components/BoardMap.vue';

const props = defineProps<{ id: string }>();

const detail = ref<OrderDetail | null>(null);
const preview = ref<NestingPlan | null>(null);
const err = ref('');
const msg = ref('');
const busy = ref(false);

const statusText: Record<string, string> = {
  pending: '待开料',
  in_cutting: '开料中',
  cut: '已开完',
  archived: '已归档',
};

async function load() {
  detail.value = await api.orderDetail(Number(props.id));
  preview.value = null;
}
onMounted(load);

const currentPlan = computed(() =>
  detail.value?.plans.find((p) => p.is_current) ?? detail.value?.plans.at(-1),
);

const uncutTotal = computed(() =>
  detail.value
    ? detail.value.demands.reduce((s, d) => s + (d.qty - d.cut_qty), 0)
    : 0,
);

async function doPreview() {
  err.value = '';
  msg.value = '';
  try {
    preview.value = await api.preview(Number(props.id));
  } catch (e: any) {
    err.value = e.message;
  }
}

async function doCut() {
  err.value = '';
  msg.value = '';
  busy.value = true;
  try {
    const r = await api.cut(Number(props.id));
    msg.value = `已确认开料：新开整板 ${r.plan.whole_sheets_used} 张，复用余料 ${r.plan.remnants_used.length} 块，新登记边角料 ${r.plan.boards.reduce((s: number, b: any) => s + b.remnants.length, 0)} 块`;
    await load();
  } catch (e: any) {
    err.value = e.message;
  } finally {
    busy.value = false;
  }
}

// ---------- 改单 ----------
const changeKind = ref<'append' | 'reduce'>('append');
const appendForm = ref({ name: '', length: 600, width: 400, qty: 1, note: '' });
const reduceTarget = ref<number | ''>('');
const reduceQty = ref(1);
const changeNote = ref('');
const changeResult = ref<any>(null);

async function submitChange() {
  err.value = '';
  changeResult.value = null;
  try {
    const body =
      changeKind.value === 'append'
        ? {
            kind: 'append',
            name: appendForm.value.name.trim(),
            length: Math.trunc(Number(appendForm.value.length)),
            width: Math.trunc(Number(appendForm.value.width)),
            qty_delta: Math.trunc(Number(appendForm.value.qty)),
            note: changeNote.value,
          }
        : {
            kind: 'reduce',
            demand_id: Number(reduceTarget.value),
            qty_delta: Math.trunc(Number(reduceQty.value)),
            note: changeNote.value,
          };
    changeResult.value = await api.change(Number(props.id), body);
    changeNote.value = '';
    await load();
    await doPreview();
  } catch (e: any) {
    err.value = e.message;
  }
}

const reduceDemand = computed(() =>
  detail.value?.demands.find((d) => d.id === Number(reduceTarget.value)),
);

function partArea(b: any) {
  return b.parts.reduce((s: number, p: any) => s + p.length * p.width, 0);
}
function boardArea(b: any) {
  return b.board_length * b.board_width;
}
function boardDensity(b: any) {
  return Math.floor((partArea(b) / boardArea(b)) * 1000);
}
function totalRemnantArea(plan: NestingPlan) {
  return plan.boards.reduce(
    (s, b) => s + b.remnants.reduce((x, r) => x + r.area, 0),
    0,
  );
}
</script>

<template>
  <div v-if="detail">
    <div class="toolbar">
      <RouterLink to="/orders" class="muted">← 订单列表</RouterLink>
      <span class="spacer"></span>
    </div>

    <div class="toolbar">
      <h1 class="page-title" style="margin:0">{{ detail.order.code }}</h1>
      <span class="badge" :class="detail.order.status">{{ statusText[detail.order.status] }}</span>
      <span class="muted">版本 v{{ detail.order.version }}</span>
      <span class="spacer"></span>
    </div>
    <p class="page-sub">
      客户：{{ detail.order.customer }} ｜ 板材：{{ detail.spec.code }}
      （{{ detail.spec.name }} {{ detail.spec.length }}×{{ detail.spec.width }}×{{ detail.spec.thickness }}mm）
      ｜ 整板库存 {{ detail.spec.stock_sheets }} 张
    </p>

    <div v-if="msg" class="alert ok">{{ msg }}</div>
    <div v-if="err" class="alert error">{{ err }}</div>

    <!-- 部件需求 -->
    <div class="panel">
      <h2>开料需求（已开料数量冻结，改单只能动未开部分）</h2>
      <table>
        <thead>
          <tr>
            <th>部件名</th><th class="num">长 mm</th><th class="num">宽 mm</th>
            <th class="num">需求</th><th class="num">已开</th><th class="num">未开</th><th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in detail.demands" :key="d.id">
            <td>{{ d.name }}</td>
            <td class="num">{{ d.length }}</td>
            <td class="num">{{ d.width }}</td>
            <td class="num">{{ d.qty }}</td>
            <td class="num">{{ d.cut_qty }}</td>
            <td class="num"><strong>{{ d.qty - d.cut_qty }}</strong></td>
            <td>
              <span v-if="d.cut_qty >= d.qty" class="badge cut">已开完</span>
              <span v-else-if="d.cut_qty > 0" class="badge in_cutting">部分已开（冻结）</span>
              <span v-else class="badge pending">未开料</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="foot-note">
        当前未开料 {{ uncutTotal }} 件；本单累计已耗整板
        {{ detail.plans.reduce((s, p) => s + p.whole_sheets_used, 0) }} 张。
      </div>
    </div>

    <!-- 套裁操作 -->
    <div class="panel" v-if="uncutTotal > 0">
      <h2>套裁方案与开料</h2>
      <div class="toolbar">
        <button class="btn secondary" @click="doPreview">生成套裁预览（只算不扣库存）</button>
        <button class="btn" :disabled="busy || !preview" @click="doCut">
          确认开料（吃余料 / 扣整板 / 登记边角料）
        </button>
        <span v-if="!preview" class="muted">先预览，确认无误再开料</span>
      </div>

      <div v-if="preview">
        <div class="cards" style="margin-top:8px">
          <div class="card">
            <div class="k">本次新开整板</div>
            <div class="v">{{ preview.whole_sheets_used }}<small>张</small></div>
          </div>
          <div class="card">
            <div class="k">先吃余料</div>
            <div class="v">{{ preview.remnants_used.length }}<small>块</small></div>
            <div class="sub">
              {{ preview.remnants_used.length ? '余料 id：' + preview.remnants_used.join(', ') : '无可用余料，全部走整板' }}
            </div>
          </div>
          <div class="card">
            <div class="k">切完登记边角料</div>
            <div class="v">{{ preview.boards.reduce((s, b) => s + b.remnants.length, 0) }}<small>块</small></div>
            <div class="sub">合计 {{ fmtM2(totalRemnantArea(preview)) }} m²</div>
          </div>
          <div class="card">
            <div class="k">本次部件面积</div>
            <div class="v">{{ fmtM2(preview.total_part_area) }}<small>m²</small></div>
          </div>
        </div>

        <div class="legend">
          <span><i class="lp"></i>部件（蓝色）</span>
          <span><i class="lrot"></i>旋转 90° 部件（橙色）</span>
          <span><i class="lr"></i>登记边角料（绿色虚线）</span>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:22px;margin-top:10px">
          <div v-for="b in preview.boards" :key="b.index">
            <div style="margin-bottom:6px">
              <span class="badge" :class="b.kind">{{ b.kind === 'sheet' ? '新开整板' : `复用余料 #${b.remnant_id}` }}</span>
              <span class="muted" style="margin-left:6px">
                {{ b.board_length }}×{{ b.board_width }}mm ｜ 部件 {{ b.parts.length }} 件 ｜
                利用 {{ fmtPermille(boardDensity(b)) }}
              </span>
            </div>
            <BoardMap :board="b" :max-width="300" />
          </div>
        </div>
      </div>
    </div>

    <!-- 变更单 -->
    <div class="panel" v-if="detail.order.status !== 'archived'">
      <h2>变更单（只能追加 / 减少未开料部分，已开部件不动）</h2>
      <div class="toolbar">
        <label style="display:flex;align-items:center;gap:6px">
          <input type="radio" value="append" v-model="changeKind" style="width:auto" /> 追加部件
        </label>
        <label style="display:flex;align-items:center;gap:6px">
          <input type="radio" value="reduce" v-model="changeKind" style="width:auto" /> 减少数量
        </label>
      </div>

      <div v-if="changeKind === 'append'" class="grid-3">
        <label class="field"><span>部件名（同名同尺寸自动合并）</span><input v-model="appendForm.name" /></label>
        <label class="field"><span>长 mm</span><input type="number" v-model.number="appendForm.length" /></label>
        <label class="field"><span>宽 mm</span><input type="number" v-model.number="appendForm.width" /></label>
        <label class="field"><span>追加数量</span><input type="number" min="1" v-model.number="appendForm.qty" /></label>
        <label class="field" style="grid-column:span 2"><span>备注</span><input v-model="changeNote" placeholder="如：客户加两块活动层板" /></label>
      </div>

      <div v-else class="grid-3">
        <label class="field">
          <span>减少哪个部件</span>
          <select v-model="reduceTarget">
            <option value="" disabled>请选择</option>
            <option v-for="d in detail.demands" :key="d.id" :value="d.id" :disabled="d.qty - d.cut_qty <= 0">
              {{ d.name }}（需求 {{ d.qty }}，已开 {{ d.cut_qty }}，最多可减 {{ d.qty - d.cut_qty }}）
            </option>
          </select>
        </label>
        <label class="field">
          <span>减少数量（不超过未开 {{ reduceDemand ? reduceDemand.qty - reduceDemand.cut_qty : 0 }} 件）</span>
          <input type="number" min="1" :max="reduceDemand ? reduceDemand.qty - reduceDemand.cut_qty : 1" v-model.number="reduceQty" />
        </label>
        <label class="field"><span>备注</span><input v-model="changeNote" /></label>
      </div>

      <button class="btn" @click="submitChange">提交变更并重算耗板</button>

      <div v-if="changeResult" class="alert info" style="margin-top:12px">
        重算完成：累计耗板
        <strong>{{ changeResult.sheets_before }}</strong> 张 →
        <strong>{{ changeResult.sheets_after }}</strong> 张
        （已开料耗 {{ changeResult.already_cut_sheets }} 张不动，未开部分重排）。下次“确认开料”时生效。
      </div>
    </div>

    <!-- 历史方案与留痕 -->
    <div class="grid-2">
      <div class="panel">
        <h2>套裁方案留痕（{{ detail.plans.length }} 版）</h2>
        <table>
          <thead>
            <tr><th>版本</th><th class="num">整板</th><th class="num">吃余料</th><th>时间</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in detail.plans" :key="p.id">
              <td>v{{ p.plan_version }} <span v-if="p.is_current" class="badge available">当前</span></td>
              <td class="num">{{ p.whole_sheets_used }}</td>
              <td class="num">{{ p.remnants_used.length }}</td>
              <td class="muted">{{ p.created_at }}</td>
              <td>{{ fmtM2(p.part_area) }} m² 部件</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2>变更记录（{{ detail.changes.length }} 次）</h2>
        <table v-if="detail.changes.length">
          <thead>
            <tr><th>版本</th><th>类型</th><th>部件</th><th class="num">数量</th><th class="num">耗板变化</th><th>备注</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in detail.changes" :key="c.id">
              <td>v{{ c.version_before }}→{{ c.version_after }}</td>
              <td>
                <span :class="c.kind === 'append' ? 'badge in_cutting' : 'badge pending'">
                  {{ c.kind === 'append' ? '追加' : '减少' }}
                </span>
              </td>
              <td>{{ c.part_name }}<div class="muted" style="font-size:11px">{{ c.length }}×{{ c.width }}</div></td>
              <td class="num" :style="{ color: c.qty_delta > 0 ? '#1a8a4c' : '#c0392b' }">
                {{ c.qty_delta > 0 ? '+' : '' }}{{ c.qty_delta }}
              </td>
              <td class="num">{{ c.sheets_before }} → {{ c.sheets_after }}</td>
              <td class="muted">{{ c.note }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">暂无变更。</p>
      </div>
    </div>

    <!-- 当前方案板图 -->
    <div class="panel" v-if="currentPlan">
      <h2>当前套裁方案板图（v{{ currentPlan.plan_version }}）</h2>
      <div style="display:flex;flex-wrap:wrap;gap:22px">
        <div v-for="b in currentPlan.boards" :key="b.index">
          <div style="margin-bottom:6px">
            <span class="badge" :class="b.kind">{{ b.kind === 'sheet' ? '整板' : `余料 #${b.remnant_id}` }}</span>
            <span class="muted" style="margin-left:6px">
              {{ b.board_length }}×{{ b.board_width }}mm，部件 {{ b.parts.length }} 件，利用 {{ fmtPermille(boardDensity(b)) }}
            </span>
          </div>
          <BoardMap :board="b" :max-width="280" />
        </div>
      </div>
    </div>
  </div>
</template>
