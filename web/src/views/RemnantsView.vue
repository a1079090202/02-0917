<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtM2 } from '../format';

const materials = ref<any[]>([]);
const rows = ref<any[]>([]);
const specFilter = ref('');
const statusFilter = ref('available');
const locationFilter = ref('');

// 匹配试算
const matchSpec = ref('');
const matchParts = ref([{ name: '', length: 600, width: 400 }]);
const matches = ref<any[] | null>(null);
const matchErr = ref('');

async function load() {
  rows.value = await api.remnants({
    spec_id: specFilter.value || undefined,
    status: statusFilter.value || undefined,
    location: locationFilter.value || undefined,
  });
}
onMounted(async () => {
  materials.value = await api.materials();
  matchSpec.value = String(materials.value[0]?.id ?? '');
  await load();
});

async function runMatch() {
  matchErr.value = '';
  matches.value = null;
  const parts = matchParts.value
    .filter((p) => p.name.trim())
    .map((p) => ({
      name: p.name.trim(),
      length: Math.trunc(Number(p.length)),
      width: Math.trunc(Number(p.width)),
    }));
  if (!parts.length) {
    matchErr.value = '至少填一个部件';
    return;
  }
  try {
    matches.value = await api.match(Number(matchSpec.value), parts);
  } catch (e: any) {
    matchErr.value = e.message;
  }
}

const totalArea = () => rows.value.reduce((s, r) => s + r.area, 0);
</script>

<template>
  <h1 class="page-title">余料复用台账</h1>
  <p class="page-sub">
    每块边角料按规格、尺寸、位置登记。开料时系统先试算“吃哪块最省”，有余料能切就先吃余料再开整板。
  </p>

  <div class="panel">
    <div class="toolbar">
      <select v-model="specFilter" style="width:240px" @change="load">
        <option value="">全部规格</option>
        <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.code }}</option>
      </select>
      <select v-model="statusFilter" style="width:140px" @change="load">
        <option value="available">可用</option>
        <option value="consumed">已消耗</option>
        <option value="">全部状态</option>
      </select>
      <input v-model="locationFilter" placeholder="按位置筛选，如 A架" style="width:180px" @keyup.enter="load" />
      <button class="btn ghost" @click="load">筛选</button>
      <span class="spacer"></span>
      <span class="muted">共 {{ rows.length }} 块，{{ fmtM2(totalArea()) }} m²</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>ID</th><th>规格</th><th class="num">长 mm</th><th class="num">宽 mm</th>
          <th class="num">面积</th><th>状态</th><th>存放位置</th><th>来源订单</th><th>消耗于</th><th>登记时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td class="mono">#{{ r.id }}</td>
          <td class="mono">{{ r.spec_code }}</td>
          <td class="num">{{ r.length }}</td>
          <td class="num">{{ r.width }}</td>
          <td class="num">{{ fmtM2(r.area) }} m²</td>
          <td><span class="badge" :class="r.status">{{ r.status === 'available' ? '可用' : r.status === 'consumed' ? '已消耗' : '部分用' }}</span></td>
          <td>{{ r.location }}</td>
          <td>{{ r.produced_order_code ?? '历史存料' }}</td>
          <td>{{ r.consumed_order_code ?? '—' }}</td>
          <td class="muted">{{ r.created_at }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>余料匹配试算（先吃哪块最省）</h2>
    <p class="muted" style="margin-top:-6px">
      填入准备开的部件，系统按“浪费面积最小 → 短边最接近 → 小料优先”给出余料动用顺序。
    </p>
    <div class="toolbar">
      <select v-model="matchSpec" style="width:240px">
        <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.code }}</option>
      </select>
    </div>
    <table class="parts-editor">
      <thead>
        <tr><th>部件名</th><th style="width:150px">长 mm</th><th style="width:150px">宽 mm</th><th style="width:60px"></th></tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in matchParts" :key="i">
          <td><input v-model="p.name" /></td>
          <td><input type="number" v-model.number="p.length" /></td>
          <td><input type="number" v-model.number="p.width" /></td>
          <td><button class="btn ghost" @click="matchParts.splice(i, 1)">删</button></td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:10px;display:flex;gap:10px">
      <button class="btn secondary" @click="matchParts.push({ name: '', length: 600, width: 400 })">+ 部件</button>
      <button class="btn" @click="runMatch">试算匹配顺序</button>
    </div>

    <div v-if="matchErr" class="alert error" style="margin-top:12px">{{ matchErr }}</div>

    <table v-if="matches" style="margin-top:14px">
      <thead>
        <tr>
          <th>顺位</th><th>余料</th><th>规格</th><th class="num">尺寸</th>
          <th class="num">浪费面积</th><th>可切部件</th><th>建议</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(m, i) in matches" :key="m.remnant_id" :style="{ opacity: m.usable ? 1 : 0.5 }">
          <td><strong>#{{ i + 1 }}</strong></td>
          <td class="mono">#{{ m.remnant_id }}（{{ m.location }}）</td>
          <td>{{ m.spec_code }}</td>
          <td class="num">{{ m.length }}×{{ m.width }}mm</td>
          <td class="num">{{ m.usable ? fmtM2(m.waste_area) + ' m²' : '—' }}</td>
          <td>{{ m.matched_part ? `${m.matched_part} ${m.matched_dims}mm` : '无' }}</td>
          <td class="muted">{{ m.rank_reason }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
