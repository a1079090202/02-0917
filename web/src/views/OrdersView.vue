<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { ORDER_STATUS } from '../format';
import type { BoardSpec, OrderListItem } from '../types';

const router = useRouter();
const orders = ref<OrderListItem[]>([]);
const specs = ref<BoardSpec[]>([]);
const error = ref('');
const showCreate = ref(false);
const busy = ref(false);

const customer = ref('');
const note = ref('');
const items = reactive<Array<{ part_name: string; spec_id: number; length_mm: number; width_mm: number; quantity: number }>>([]);

async function load() {
  orders.value = await api.listOrders();
}

onMounted(async () => {
  try {
    [orders.value, specs.value] = await Promise.all([api.listOrders(), api.listBoards()]);
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function openCreate() {
  showCreate.value = true;
  if (!items.length) addItem();
}

function addItem() {
  items.push({ part_name: '', spec_id: specs.value[0]?.id ?? 0, length_mm: 800, width_mm: 400, quantity: 1 });
}

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const detail = await api.createOrder({
      customer: customer.value,
      note: note.value,
      items: items.map((i) => ({ ...i })),
    });
    showCreate.value = false;
    customer.value = '';
    note.value = '';
    items.splice(0);
    router.push(`/orders/${detail.order.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1>订单管理</h1>
  <p class="page-desc">每个订单拆成开料需求（部件、尺寸、数量），在详情页生成套裁方案。</p>

  <div v-if="error" class="alert error">{{ error }}</div>

  <div class="card">
    <div class="card-title">
      <h2>订单列表（{{ orders.length }}）</h2>
      <button class="primary" @click="openCreate">＋ 新建订单</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>单号</th><th>客户</th><th>备注</th><th class="num">部件行</th>
          <th class="num">开料进度</th><th class="num">整板耗用</th><th class="num">余料耗用</th>
          <th>状态</th><th>创建时间</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in orders" :key="o.id">
          <td class="mono"><b>{{ o.code }}</b></td>
          <td>{{ o.customer }}</td>
          <td class="muted">{{ o.note }}</td>
          <td class="num mono">{{ o.item_count }}</td>
          <td class="num mono">{{ o.parts_cut }}/{{ o.parts_total }}</td>
          <td class="num mono">{{ o.boards_used }} 张</td>
          <td class="num mono">{{ o.remnants_used }} 块</td>
          <td><span class="badge" :class="o.status">{{ ORDER_STATUS[o.status] }}</span></td>
          <td class="muted">{{ o.created_at }}</td>
          <td><button class="small" @click="router.push(`/orders/${o.id}`)">查看</button></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-if="showCreate" class="dialog-mask" @click.self="showCreate = false">
    <div class="dialog">
      <h2>新建订单</h2>
      <div class="form-row">
        <label>客户</label>
        <input v-model="customer" placeholder="客户姓名" style="width: 160px" />
        <label>备注</label>
        <input v-model="note" placeholder="如：主卧衣柜" style="flex: 1" />
      </div>
      <h2>开料需求</h2>
      <table>
        <thead>
          <tr><th>部件名</th><th>板材规格</th><th>长(mm)</th><th>宽(mm)</th><th>数量</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in items" :key="i">
            <td><input v-model="it.part_name" placeholder="侧板" style="width: 110px" /></td>
            <td>
              <select v-model.number="it.spec_id">
                <option v-for="s in specs" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </td>
            <td><input v-model.number="it.length_mm" type="number" min="1" /></td>
            <td><input v-model.number="it.width_mm" type="number" min="1" /></td>
            <td><input v-model.number="it.quantity" type="number" min="1" style="width: 64px" /></td>
            <td><button class="small danger" :disabled="items.length <= 1" @click="items.splice(i, 1)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <div class="form-row" style="margin-top: 10px">
        <button class="small" @click="addItem">＋ 加一行</button>
        <span class="spacer"></span>
        <button @click="showCreate = false">取消</button>
        <button class="primary" :disabled="busy" @click="submit">创建订单</button>
      </div>
    </div>
  </div>
</template>
