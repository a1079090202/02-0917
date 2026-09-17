<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtAreaFull } from '../format';
import type { BoardSpec } from '../types';

const specs = ref<BoardSpec[]>([]);
const error = ref('');
const showForm = ref(false);
const form = ref({ name: '', length_mm: 2440, width_mm: 1220, thickness_mm: 18, material: '颗粒板' });

async function load() {
  specs.value = await api.listBoards();
}

onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function submit() {
  error.value = '';
  try {
    await api.createBoard({ ...form.value });
    showForm.value = false;
    form.value = { name: '', length_mm: 2440, width_mm: 1220, thickness_mm: 18, material: '颗粒板' };
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <h1>板材台账</h1>
  <p class="page-desc">按规格（长×宽×厚）和材质建档，开料时按规格匹配。</p>

  <div v-if="error" class="alert error">{{ error }}</div>

  <div class="card">
    <div class="card-title">
      <h2>规格列表（{{ specs.length }} 种）</h2>
      <button class="primary" @click="showForm = !showForm">{{ showForm ? '收起' : '＋ 新增规格' }}</button>
    </div>

    <div v-if="showForm" class="form-row" style="padding: 10px 0; border-bottom: 1px solid var(--line); margin-bottom: 10px">
      <input v-model="form.name" placeholder="名称，如：颗粒板 2440×1220×18" style="width: 240px" />
      <label>长</label><input v-model.number="form.length_mm" type="number" min="1" />
      <label>宽</label><input v-model.number="form.width_mm" type="number" min="1" />
      <label>厚</label><input v-model.number="form.thickness_mm" type="number" min="1" style="width: 70px" />
      <label>材质</label><input v-model="form.material" style="width: 100px" />
      <button class="primary" @click="submit">保存</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th><th>名称</th><th>材质</th><th class="num">长(mm)</th><th class="num">宽(mm)</th>
          <th class="num">厚(mm)</th><th>单张面积</th><th>建档时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in specs" :key="s.id">
          <td class="muted">{{ s.id }}</td>
          <td>{{ s.name }}</td>
          <td>{{ s.material }}</td>
          <td class="num mono">{{ s.length_mm }}</td>
          <td class="num mono">{{ s.width_mm }}</td>
          <td class="num mono">{{ s.thickness_mm }}</td>
          <td>{{ fmtAreaFull(s.area_mm2) }}</td>
          <td class="muted">{{ s.created_at }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
