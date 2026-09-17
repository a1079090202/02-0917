<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { BoardSpec, OrderItem } from '../types';

const props = defineProps<{
  items: OrderItem[];
  specs: BoardSpec[];
  busy: boolean;
}>();

const emit = defineEmits<{
  submit: [
    payload: {
      reason: string;
      adds: Array<{ part_name: string; spec_id: number; length_mm: number; width_mm: number; quantity: number }>;
      reductions: Array<{ item_id: number; new_quantity: number }>;
    },
  ];
}>();

const reason = ref('');
const adds = reactive<Array<{ part_name: string; spec_id: number; length_mm: number; width_mm: number; quantity: number }>>([]);
const reductions = reactive<Array<{ item_id: number; new_quantity: number }>>([]);

/** 还有未开料数量的部件才能减 */
const reducibleItems = computed(() => props.items.filter((i) => i.quantity - i.cut_quantity > 0));

function itemById(id: number): OrderItem | undefined {
  return props.items.find((i) => i.id === id);
}

function addRow() {
  adds.push({ part_name: '', spec_id: props.specs[0]?.id ?? 0, length_mm: 800, width_mm: 400, quantity: 1 });
}

function addReduction() {
  const first = reducibleItems.value[0];
  if (!first) return;
  reductions.push({ item_id: first.id, new_quantity: first.quantity - 1 });
}

function submit() {
  emit('submit', {
    reason: reason.value.trim(),
    adds: adds.map((a) => ({ ...a })),
    reductions: reductions.map((r) => ({ ...r })),
  });
}
</script>

<template>
  <div>
    <div class="form-row">
      <label>变更原因</label>
      <input v-model="reason" placeholder="如：客户加两块层板" style="flex: 1; min-width: 220px" />
    </div>

    <h2 style="margin-top: 14px">追加部件</h2>
    <table v-if="adds.length">
      <thead>
        <tr><th>部件名</th><th>板材规格</th><th>长(mm)</th><th>宽(mm)</th><th>数量</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="(a, i) in adds" :key="i">
          <td><input v-model="a.part_name" placeholder="层板" style="width: 110px" /></td>
          <td>
            <select v-model.number="a.spec_id">
              <option v-for="s in specs" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </td>
          <td><input v-model.number="a.length_mm" type="number" min="1" /></td>
          <td><input v-model.number="a.width_mm" type="number" min="1" /></td>
          <td><input v-model.number="a.quantity" type="number" min="1" style="width: 64px" /></td>
          <td><button class="small danger" @click="adds.splice(i, 1)">删除</button></td>
        </tr>
      </tbody>
    </table>
    <button class="small" @click="addRow">＋ 追加部件</button>

    <h2 style="margin-top: 14px">减少未开料部件</h2>
    <p v-if="!reducibleItems.length" class="muted" style="margin: 4px 0">
      所有部件都已开完料，没有可减少的部分。
    </p>
    <template v-else>
      <table v-if="reductions.length">
        <thead>
          <tr><th>部件</th><th>原数量</th><th>已开料</th><th>改为</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in reductions" :key="i">
            <td>
              <select v-model.number="r.item_id" @change="r.new_quantity = (itemById(r.item_id)?.quantity ?? 1) - 1">
                <option v-for="it in reducibleItems" :key="it.id" :value="it.id">
                  {{ it.part_name }} {{ it.length_mm }}×{{ it.width_mm }}
                </option>
              </select>
            </td>
            <td class="num">{{ itemById(r.item_id)?.quantity }}</td>
            <td class="num">{{ itemById(r.item_id)?.cut_quantity }}</td>
            <td>
              <input
                v-model.number="r.new_quantity"
                type="number"
                :min="itemById(r.item_id)?.cut_quantity ?? 0"
                :max="(itemById(r.item_id)?.quantity ?? 1) - 1"
                style="width: 72px"
              />
            </td>
            <td><button class="small danger" @click="reductions.splice(i, 1)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <button class="small" @click="addReduction">－ 减少部件</button>
    </template>

    <div class="form-row" style="margin-top: 16px">
      <button class="primary" :disabled="busy || (!adds.length && !reductions.length)" @click="submit">
        提交变更并重算方案
      </button>
      <span class="muted">已开料的部件不受影响；提交后系统按最新需求重算套裁方案与耗板数</span>
    </div>
  </div>
</template>
