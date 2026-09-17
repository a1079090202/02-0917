<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtM, fmtM2, yuanFromFen } from '../format';

const materials = ref<any[]>([]);
const err = ref('');
const ok = ref('');
const showForm = ref(false);

const form = ref({
  code: '',
  name: '',
  length: 2440,
  width: 1220,
  thickness: 18,
  stock_sheets: 0,
  unit_price: 0,
});

async function load() {
  materials.value = await api.materials();
}
onMounted(load);

async function submit() {
  err.value = '';
  try {
    await api.createMaterial({
      ...form.value,
      length: Math.trunc(Number(form.value.length)),
      width: Math.trunc(Number(form.value.width)),
      thickness: Math.trunc(Number(form.value.thickness)),
      stock_sheets: Math.trunc(Number(form.value.stock_sheets)),
      unit_price: Math.round(Number(form.value.unit_price) * 100),
    });
    showForm.value = false;
    ok.value = '规格已建档';
    await load();
    setTimeout(() => (ok.value = ''), 2500);
  } catch (e: any) {
    err.value = e.message;
  }
}

async function restock(id: number, delta: number) {
  await api.restock(id, delta);
  await load();
}
</script>

<template>
  <h1 class="page-title">板材台账</h1>
  <p class="page-sub">按 规格编码（长×宽×厚 + 材质）建档；长度毫米、面积平方毫米，整数存储。</p>

  <div v-if="ok" class="alert ok">{{ ok }}</div>
  <div v-if="err" class="alert error">{{ err }}</div>

  <div class="panel">
    <div class="toolbar">
      <h2 style="margin:0;flex:1">在库规格（{{ materials.length }}）</h2>
      <button class="btn secondary" @click="showForm = !showForm">
        {{ showForm ? '收起' : '+ 新建规格' }}
      </button>
    </div>

    <div v-if="showForm" class="panel" style="background:#f9fbff;margin-bottom:16px">
      <div class="grid-3">
        <label class="field"><span>规格编码</span><input v-model="form.code" placeholder="如 PB-2440-1220-18" /></label>
        <label class="field"><span>材质</span><input v-model="form.name" placeholder="如 颗粒板" /></label>
        <label class="field"><span>厚度 mm</span><input v-model.number="form.thickness" type="number" /></label>
        <label class="field"><span>长 mm</span><input v-model.number="form.length" type="number" /></label>
        <label class="field"><span>宽 mm</span><input v-model.number="form.width" type="number" /></label>
        <label class="field"><span>库存整板（张）</span><input v-model.number="form.stock_sheets" type="number" /></label>
        <label class="field"><span>单价（元/张）</span><input v-model.number="form.unit_price" type="number" step="0.01" /></label>
      </div>
      <button class="btn" @click="submit">保存</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>编码</th><th>材质</th><th>长 mm</th><th>宽 mm</th><th>厚 mm</th>
          <th>单张面积</th><th class="num">库存(张)</th><th>单价</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in materials" :key="m.id">
          <td class="mono">{{ m.code }}</td>
          <td>{{ m.name }}</td>
          <td class="num">{{ m.length }}</td>
          <td class="num">{{ m.width }}</td>
          <td class="num">{{ m.thickness }}</td>
          <td class="num">{{ fmtM(m.length) }}×{{ fmtM(m.width) }}＝{{ fmtM2(m.length * m.width) }} m²</td>
          <td class="num"><strong>{{ m.stock_sheets }}</strong></td>
          <td class="num">¥{{ yuanFromFen(m.unit_price) }}</td>
          <td class="nowrap">
            <button class="btn ghost" @click="restock(m.id, 10)">+10 张</button>
            <button class="btn ghost" :disabled="m.stock_sheets < 10" @click="restock(m.id, -10)">−10</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
