<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtAreaFull, fmtPct } from '../format';
import type { RemnantLedger, Utilization } from '../types';

const now = new Date();
const month = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
const util = ref<Utilization | null>(null);
const ledger = ref<RemnantLedger | null>(null);
const error = ref('');

async function load() {
  error.value = '';
  try {
    [util.value, ledger.value] = await Promise.all([
      api.utilization(month.value),
      api.remnantLedger(month.value),
    ]);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onMounted(load);
</script>

<template>
  <h1>月末统计</h1>
  <p class="page-desc">板材利用率两个口径 + 余料复用台账月结，全部按毫米/平方毫米整数计算。</p>

  <div class="toolbar">
    <label class="muted">月份</label>
    <input v-model="month" type="month" @change="load" />
  </div>

  <div v-if="error" class="alert error">{{ error }}</div>

  <template v-if="util">
    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">利用率 · 按整张数</div>
        <div class="value">{{ fmtPct(util.byCount.pctX100) }}</div>
        <div class="hint">
          整板切出的部件面积 ÷ 新开整板总面积<br />
          {{ fmtAreaFull(util.byCount.numerator) }} ÷ {{ fmtAreaFull(util.byCount.denominator) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="label">利用率 · 按面积</div>
        <div class="value">{{ fmtPct(util.byArea.pctX100) }}</div>
        <div class="hint">
          全部部件面积 ÷（整板面积＋耗用余料面积）<br />
          {{ fmtAreaFull(util.byArea.numerator) }} ÷ {{ fmtAreaFull(util.byArea.denominator) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="label">对账平衡</div>
        <div class="value">{{ util.balance.ok ? '✓' : '✗' }}</div>
        <div class="hint">
          投入 {{ fmtAreaFull(util.balance.inputs) }}<br />
          ＝ 部件＋回收余料＋损耗 {{ fmtAreaFull(util.balance.outputs) }}
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{{ util.month }} 投入产出对账</h2>
      <table>
        <thead>
          <tr><th>项目</th><th class="num">数量</th><th class="num">面积</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>新开整板</td>
            <td class="num mono">{{ util.boards.newCount }} 张</td>
            <td class="num">{{ fmtAreaFull(util.boards.newArea) }}</td>
            <td class="muted">按整张数口径的分母</td>
          </tr>
          <tr>
            <td>耗用余料</td>
            <td class="num mono">{{ util.boards.remnantCount }} 块</td>
            <td class="num">{{ fmtAreaFull(util.boards.remnantArea) }}</td>
            <td class="muted">从余料台账吃掉的料</td>
          </tr>
          <tr>
            <td>部件产出 · 来自整板</td>
            <td class="num mono">—</td>
            <td class="num">{{ fmtAreaFull(util.parts.fromNewArea) }}</td>
            <td class="muted">按整张数口径的分子</td>
          </tr>
          <tr>
            <td>部件产出 · 来自余料</td>
            <td class="num mono">—</td>
            <td class="num">{{ fmtAreaFull(util.parts.fromRemnantArea) }}</td>
            <td class="muted">余料复用省下的整板</td>
          </tr>
          <tr>
            <td><b>部件产出合计</b></td>
            <td class="num mono">—</td>
            <td class="num"><b>{{ fmtAreaFull(util.parts.totalArea) }}</b></td>
            <td class="muted">按面积口径的分子</td>
          </tr>
          <tr>
            <td>回收余料（登记进台账）</td>
            <td class="num mono">{{ util.remnantsRegistered.count }} 块</td>
            <td class="num">{{ fmtAreaFull(util.remnantsRegistered.area) }}</td>
            <td class="muted">切完剩下的可用边角料</td>
          </tr>
          <tr>
            <td>损耗（锯缝/碎料）</td>
            <td class="num mono">—</td>
            <td class="num">{{ fmtAreaFull(util.wasteArea) }}</td>
            <td class="muted">太小不能登记的边料</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <div v-if="ledger" class="card">
    <h2>{{ ledger.month }} 余料复用台账月结</h2>
    <table>
      <thead>
        <tr><th>项目</th><th class="num">块数</th><th class="num">面积</th></tr>
      </thead>
      <tbody>
        <tr><td>期初结余</td><td class="num mono">{{ ledger.opening.count }}</td><td class="num">{{ fmtAreaFull(ledger.opening.area) }}</td></tr>
        <tr><td>本月登记（开料回收）</td><td class="num mono">＋{{ ledger.registered.count }}</td><td class="num">{{ fmtAreaFull(ledger.registered.area) }}</td></tr>
        <tr><td>本月耗用（复用吃掉）</td><td class="num mono">－{{ ledger.consumed.count }}</td><td class="num">{{ fmtAreaFull(ledger.consumed.area) }}</td></tr>
        <tr><td><b>期末结余</b></td><td class="num mono"><b>{{ ledger.closing.count }}</b></td><td class="num"><b>{{ fmtAreaFull(ledger.closing.area) }}</b></td></tr>
      </tbody>
    </table>
  </div>
</template>
