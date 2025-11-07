<template>
  <article
    class="grid grid-cols-[1fr_auto_auto] md:grid-cols-[1fr_220px_200px] items-center gap-2.5 px-3.5 py-4 mx-1.5 my-2.5 rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-[0_4px_18px_rgba(15,23,42,0.16)]"
  >
    <!-- Name + tooltip -->
    <h3 class="m-0 text-[22px] leading-tight font-extrabold text-slate-800">
      <HelpTooltip :lines="item.desc">
        {{ item.name }}
      </HelpTooltip>
    </h3>

    <!-- Download template (Material Symbols CSV icon) -->
    <button
      type="button"
      class="justify-self-center inline-flex items-center justify-center w-14 h-14 rounded-full text-slate-900 cursor-pointer hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed"
      aria-label="Download CSV template"
      :disabled="!item.template"
      :aria-disabled="!item.template"
      @click="item.template && $emit('download', item)"
    >
      <!-- Material Symbols 'csv' icon -->
      <span
        class="material-symbols-outlined text-[32px] leading-none"
        :class="item.template ? 'text-emerald-500' : 'text-neutral-400'"
        aria-hidden="true"
      >
        csv
      </span>
    </button>

    <!-- Upload CSV -->
    <button
      type="button"
      class="justify-self-center inline-flex items-center justify-center w-14 h-14 rounded-full text-slate-900 cursor-pointer hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed"
      :aria-label="`Upload CSV for ${item.name}`"
      @click="$emit('request-upload', item.key)"
      :disabled="disabled"
    >
      <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" class="shrink-0">
        <path
          d="M22 30l10-12 10 12"
          fill="none"
          stroke="currentColor"
          stroke-width="4.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M32 18v26" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" />
        <path
          d="M14 44v6a6 6 0 0 0 6 6h24a6 6 0 0 0 6-6v-6"
          fill="none"
          stroke="currentColor"
          stroke-width="4.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </article>
</template>

<script setup lang="ts">
import HelpTooltip from "~/components/common/HelpTooltip.vue"
import type { ImportRow as Row } from "~/data/importRows"

defineProps<{
  item: Row
  disabled?: boolean
}>()

defineEmits<{
  (e: "download", row: Row): void
  (e: "request-upload", key: Row["key"]): void
}>()
</script>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 1fr 220px 200px;
  align-items: center;
  gap: 10px;
  padding: 18px 14px;
  margin: 10px 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  transition: 0.15s;
}
.row:hover {
  border-color: #d7dbe3;
  box-shadow: 0 4px 18px rgba(16, 24, 40, 0.08);
}
.label {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  color: #243042;
  font-weight: 800;
}
.icon-btn {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 56px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #0b1526;
  cursor: pointer;
}
.icon-btn:hover {
  background: #f3f6fb;
}
.icon-btn.upload {
  font-size: 0;
}
.icon-btn.disabled {
  opacity: 0.45;
  pointer-events: none;
}

/* Tooltip */
.tooltip-wrap {
  position: relative;
  display: inline-block;
}
.tooltip-bubble {
  position: absolute;
  left: -20px;
  top: 42px;
  width: 600px;
  max-width: 70vw;
  background: #000;
  color: #fff;
  padding: 18px 20px;
  border-radius: 24px;
  font-size: 18px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.12s ease, transform 0.12s ease;
  z-index: 30;
  pointer-events: none;
}
.tooltip-bubble.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.tooltip-bubble::after {
  content: "";
  position: absolute;
  top: -18px;
  right: 160px;
  border-left: 18px solid transparent;
  border-right: 18px solid transparent;
  border-bottom: 18px solid #000;
}
.tooltip-bubble a {
  color: #60a5fa;
  text-decoration: underline;
}
@media (max-width: 820px) {
  .row {
    grid-template-columns: 1fr auto auto;
  }
  .tooltip-bubble {
    width: min(90vw, 600px);
    left: -6px;
  }
}
</style>
