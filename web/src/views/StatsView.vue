<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtM2, fmtPermille } from '../format';

const thisMonth = new Date().toISOString().slice(0, 7);
const month = ref(thisMonth);
const months = ref<string[]>([]);
const stats = ref<any>(null);
const bySpec = ref<any[]>([]);

async function load() {
  const [s, rows] = await Promise.all([
    api.monthly(month.value),
    api.bySpec(month.value),
  ]);
  stats.value = s;
  bySpec.value = rows;
}
onMounted(async () => {
  const list = await api.months();
  months.value = list.map((x: any) => x.month);
  if (!months.value.includes(thisMonth)) months.value.unshift(thisMonth);
  await load();
});
</script>

<template>
  <h1 class="page-title">月末利用率统计</h1>
  <p class="page-sub">
    两个口径都按整数面积（mm²）计算，比例以千分比整数存储，展示层换算成百分比，无浮点误差。
  </p>

  <div class="toolbar">
    <label class="muted">统计月份</label>
    <select v-model="month" style="width:160px" @change="load">
      <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
    </select>
    <input type="month" v-model="month" style="width:170px" @change="load" />
  </div>

  <div v-if="stats">
    <div class="cards">
      <div class="card">
        <div class="k">新开整板</div>
        <div class="v">{{ stats.whole_sheets_used }}<small>张</small></div>
        <div class="sub">{{ fmtM2(stats.whole_sheet_area) }} m²</div>
      </div>
      <div class="card">
        <div class="k">已开部件总面积</div>
        <div class="v">{{ fmtM2(stats.part_area) }}<small>m²</small></div>
        <div class="sub">{{ stats.orders_cut }} 个订单开料</div>
      </div>
      <div class="card">
        <div class="k">利用率 · 按整张数</div>
        <div class="v" style="color:var(--brand)">{{ fmtPermille(stats.utilized_by_sheets) }}</div>
        <div class="sub">整板上部件面积 ÷ 新开整板面积</div>
      </div>
      <div class="card">
        <div class="k">利用率 · 按面积（含余料复用）</div>
        <div class="v" style="color:var(--green)">{{ fmtPermille(stats.utilized_by_area) }}</div>
        <div class="sub">复用余料 {{ stats.remnant_consumes }} 块 / {{ fmtM2(stats.reused_area) }} m²</div>
      </div>
      <div class="card">
        <div class="k">月末余料库存</div>
        <div class="v">{{ stats.remnant_inventory_count }}<small>块</small></div>
        <div class="sub">{{ fmtM2(stats.remnant_inventory_area) }} m² 待下月复用</div>
      </div>
    </div>

    <div class="alert info">
      <strong>对账口径说明：</strong>
      ① 按整张数 = 所有方案落在“整板”上的部件面积之和 ÷（新开整板张数 × 单张面积），
      分母可用“板材台账扣减数 × 单张面积”核对；
      ② 按面积 = 全部已开部件面积 ÷（新开整板面积 + 被复用余料原面积），
      余料复用只进面积口径、不进整张数口径。
    </div>

    <div class="panel">
      <h2>按规格拆行核对</h2>
      <table>
        <thead>
          <tr>
            <th>规格</th>
            <th class="num">新开整板(张)</th>
            <th class="num">整板面积 m²</th>
            <th class="num">整板上部件 m²</th>
            <th class="num">余料上部件 m²</th>
            <th class="num">复用余料 m²</th>
            <th class="num">按整张数</th>
            <th class="num">按面积</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!bySpec.length">
            <td colspan="8" class="muted">该月没有开料记录</td>
          </tr>
          <tr v-for="g in bySpec" :key="g.spec_id">
            <td class="mono">{{ g.spec.code }}</td>
            <td class="num">{{ g.whole_sheets_used }}</td>
            <td class="num">{{ fmtM2(g.whole_sheet_area) }}</td>
            <td class="num">{{ fmtM2(g.part_on_sheet) }}</td>
            <td class="num">{{ fmtM2(g.part_on_remnant) }}</td>
            <td class="num">{{ fmtM2(g.reused_area) }}</td>
            <td class="num"><strong>{{ fmtPermille(g.utilized_by_sheets) }}</strong></td>
            <td class="num"><strong>{{ fmtPermille(g.utilized_by_area) }}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
