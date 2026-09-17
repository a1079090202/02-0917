<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router';
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-icon">▦</span>
        <div>
          <div class="brand-name">板材套裁系统</div>
          <div class="brand-sub">开料优化 · 余料复用</div>
        </div>
      </div>
      <nav>
        <RouterLink to="/orders" class="nav-item">📋 订单管理</RouterLink>
        <RouterLink to="/boards" class="nav-item">🪵 板材台账</RouterLink>
        <RouterLink to="/remnants" class="nav-item">🧩 余料台账</RouterLink>
        <RouterLink to="/changes" class="nav-item">📝 变更记录</RouterLink>
        <RouterLink to="/stats" class="nav-item">📊 月末统计</RouterLink>
      </nav>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
