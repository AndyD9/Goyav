<script setup lang="ts">
// The app's one spinner ring (styles in main.css: .goyav-spinner). It takes
// the current text colour; pass `label` when it is the only thing telling
// assistive technology that something is loading.
import { computed } from "vue";

const props = withDefaults(defineProps<{ size?: number; label?: string }>(), {
  size: 16,
  label: undefined,
});

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderWidth: props.size >= 24 ? "3px" : "2px",
}));
</script>

<template>
  <span
    class="goyav-spinner"
    :style="style"
    :role="label ? 'status' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    data-testid="spinner"
  />
</template>
