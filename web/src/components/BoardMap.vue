<script setup lang="ts">
import { computed } from 'vue';
import type { NestingSheet } from '../types';

const props = defineProps<{
  board: NestingSheet;
  /** 图的最大显示宽度 px */
  maxWidth?: number;
}>();

const MAX_W = computed(() => props.maxWidth ?? 340);

// 板长边作为 X，等比缩放
const scale = computed(() => {
  const L = Math.max(props.board.board_length, props.board.board_width);
  return MAX_W.value / L;
});

const css = (mm: number) => `${mm * scale.value}px`;

const horizontal = computed(
  () => props.board.board_length >= props.board.board_width,
);

const boxStyle = computed(() => ({
  width: css(props.board.board_length),
  height: css(props.board.board_width),
}));

function partStyle(p: { x: number; y: number; length: number; width: number }) {
  return {
    left: css(p.x),
    top: css(p.y),
    width: css(p.length),
    height: css(p.width),
  };
}
</script>

<template>
  <div>
    <div class="board-map" :style="boxStyle">
      <div
        v-for="r in board.remnants"
        :key="`r-${r.x}-${r.y}`"
        class="rem-rect"
        :style="partStyle(r)"
      ></div>
      <div
        v-for="p in board.parts"
        :key="p.uid"
        class="part"
        :class="{ rotated: p.rotated }"
        :style="partStyle(p)"
        :title="`${p.name} ${p.length}×${p.width}mm${p.rotated ? '（旋转90°）' : ''} @(${p.x},${p.y})`"
      >
        <span v-if="p.length * scale > 34 && p.width * scale > 16">
          {{ p.name }}
        </span>
      </div>
    </div>
  </div>
</template>
