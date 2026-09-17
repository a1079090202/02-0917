<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const materials = ref<any[]>([]);
const err = ref('');

const head = ref({ code: '', customer: '', spec_id: '' });
const rows = ref([
  { name: '', length: 600, width: 400, qty: 1 },
]);

onMounted(async () => {
  materials.value = await api.materials();
  head.value.spec_id = String(materials.value[0]?.id ?? '');
});

function addRow() {
  rows.value.push({ name: '', length: 600, width: 400, qty: 1 });
}
function removeRow(i: number) {
  rows.value.splice(i, 1);
}

async function submit() {
  err.value = '';
  const parts = rows.value
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      length: Math.trunc(Number(r.length)),
      width: Math.trunc(Number(r.width)),
      qty: Math.trunc(Number(r.qty)),
    }));
  try {
    const { id } = await api.createOrder({
      code: head.value.code.trim(),
      customer: head.value.customer.trim(),
      spec_id: Number(head.value.spec_id),
      parts,
    });
    router.push(`/orders/${id}`);
  } catch (e: any) {
    err.value = e.message;
  }
}
</script>

<template>
  <h1 class="page-title">新建订单</h1>
  <p class="page-sub">一单一种板材规格/材质；部件尺寸填净尺寸（毫米），锯路 3mm 由系统自动计入。</p>

  <div v-if="err" class="alert error">{{ err }}</div>

  <div class="panel">
    <h2>订单信息</h2>
    <div class="grid-3">
      <label class="field"><span>订单号</span><input v-model="head.code" placeholder="如 SO-2609-011" /></label>
      <label class="field"><span>客户</span><input v-model="head.customer" /></label>
      <label class="field">
        <span>板材规格 / 材质</span>
        <select v-model="head.spec_id">
          <option v-for="m in materials" :key="m.id" :value="m.id">
            {{ m.code }}（{{ m.name }} {{ m.length }}×{{ m.width }}×{{ m.thickness }}，库存 {{ m.stock_sheets }} 张）
          </option>
        </select>
      </label>
    </div>
  </div>

  <div class="panel">
    <h2>开料需求（部件名 × 长 × 宽 × 数量）</h2>
    <table class="parts-editor">
      <thead>
        <tr><th>部件名</th><th style="width:140px">长 mm</th><th style="width:140px">宽 mm</th><th style="width:110px">数量</th><th style="width:60px"></th></tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td><input v-model="r.name" placeholder="如 抽屉侧板" /></td>
          <td><input v-model.number="r.length" type="number" min="1" /></td>
          <td><input v-model.number="r.width" type="number" min="1" /></td>
          <td><input v-model.number="r.qty" type="number" min="1" /></td>
          <td><button class="btn ghost" @click="removeRow(i)">删</button></td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:12px">
      <button class="btn secondary" @click="addRow">+ 加一行部件</button>
    </div>
    <div style="margin-top:18px">
      <button class="btn" @click="submit">创建订单并去排样</button>
      <RouterLink to="/orders" class="btn ghost" style="margin-left:8px">取消</RouterLink>
    </div>
  </div>
</template>
