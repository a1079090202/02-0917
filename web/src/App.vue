<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">
        板材套裁系统
        <small>开料排样 · 余料复用</small>
      </div>
      <nav>
        <RouterLink to="/">总览</RouterLink>
        <RouterLink to="/orders">订单与套裁</RouterLink>
        <RouterLink to="/materials">板材台账</RouterLink>
        <RouterLink to="/remnants">余料复用台账</RouterLink>
        <RouterLink to="/stats">月末利用率</RouterLink>
      </nav>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>
