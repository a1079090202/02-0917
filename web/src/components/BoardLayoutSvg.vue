<script setup lang="ts">
import { useId } from 'vue';
import type { FreeRect, Placement } from '../types';

const props = defineProps<{
  boardW: number;
  boardH: number;
  placements: Placement[];
  remnants: FreeRect[];
}>();

const hatchId = `hatch-${useId()}`;

const COLORS = ['#4f8ef7', '#f7794f', '#3fbf7f', '#b668e8', '#e8b93f', '#4fc3d9', '#e86a92', '#9acd5a'];

function color(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

function fontSize(p: Placement): number {
  return Math.max(60, Math.min(p.w, p.h) / 5);
}
</script>

<template>
  <svg :viewBox="`0 0 ${props.boardW} ${props.boardH}`" role="img">
    <defs>
      <pattern :id="hatchId" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="60" height="60" fill="#f2efe6" />
        <line x1="0" y1="0" x2="0" y2="60" stroke="#ddd6c4" stroke-width="16" />
      </pattern>
    </defs>
    <rect x="0" y="0" :width="props.boardW" :height="props.boardH" fill="#fdfcf8" stroke="#9a927f" :stroke-width="Math.max(props.boardW, props.boardH) / 400" />
    <!-- 边角料（斜纹） -->
    <g v-for="(r, i) in props.remnants" :key="'r' + i">
      <rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" :fill="`url(#${hatchId})`" stroke="#b8b09a" :stroke-width="Math.max(props.boardW, props.boardH) / 800" stroke-dasharray="30 18">
        <title>边角料 {{ r.w }}×{{ r.h }}</title>
      </rect>
      <text
        v-if="r.w >= 400 && r.h >= 160"
        :x="r.x + r.w / 2"
        :y="r.y + r.h / 2"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="Math.min(r.w, r.h) / 4.5"
        fill="#8a8175"
      >余 {{ r.w }}×{{ r.h }}</text>
    </g>
    <!-- 部件 -->
    <g v-for="(p, i) in props.placements" :key="'p' + i">
      <rect :x="p.x" :y="p.y" :width="p.w" :height="p.h" :fill="color(p.name)" stroke="#2b2620" :stroke-width="Math.max(props.boardW, props.boardH) / 500">
        <title>{{ p.name }} {{ p.w }}×{{ p.h }}{{ p.rotated ? '（旋转）' : '' }}</title>
      </rect>
      <text
        v-if="p.w >= 300 && p.h >= 140"
        :x="p.x + p.w / 2"
        :y="p.y + p.h / 2"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="fontSize(p)"
        fill="#ffffff"
        style="pointer-events: none; user-select: none"
      >{{ p.name }}</text>
    </g>
  </svg>
</template>
