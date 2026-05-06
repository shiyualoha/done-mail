<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    size?: number;
    color?: string;
    strokeWidth?: number;
    fill?: string;
  }>(),
  {
    size: 20,
    color: 'currentColor',
    strokeWidth: 1.9,
    fill: 'none'
  }
);
</script>

<template>
  <svg
    v-if="name === 'mail'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <path d="M4 7.5l8 6 8-6" />
  </svg>

  <svg
    v-else-if="name === 'globe'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.3 2.55 3.5 5.55 3.5 9s-1.2 6.45-3.5 9" />
    <path d="M12 3C9.7 5.55 8.5 8.55 8.5 12s1.2 6.45 3.5 9" />
  </svg>

  <svg
    v-else-if="name === 'settings'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2.05 2.05 0 0 1-2.9 2.9l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .31 1.7 1.7 0 0 0-.8 1.45V21.3a2.05 2.05 0 0 1-4.1 0v-.1a1.7 1.7 0 0 0-.8-1.45 1.7 1.7 0 0 0-1-.31 1.7 1.7 0 0 0-1.87.34l-.06.06a2.05 2.05 0 0 1-2.9-2.9l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.31-1 1.7 1.7 0 0 0-1.45-.8H2.7a2.05 2.05 0 0 1 0-4.1h.1a1.7 1.7 0 0 0 1.45-.8 1.7 1.7 0 0 0 .31-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2.05 2.05 0 0 1 2.9-2.9l.06.06A1.7 1.7 0 0 0 9 4.6c.34 0 .68-.1 1-.31a1.7 1.7 0 0 0 .8-1.45V2.7a2.05 2.05 0 0 1 4.1 0v.1a1.7 1.7 0 0 0 .8 1.45c.32.2.66.31 1 .31a1.7 1.7 0 0 0 1.87-.34l.06-.06a2.05 2.05 0 0 1 2.9 2.9l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .34.1.68.31 1 .2.32.54.54.94.67.2.06.4.1.61.1h.04a2.05 2.05 0 0 1 0 4.1h-.1a1.7 1.7 0 0 0-1.45.8c-.2.32-.31.66-.31 1z" />
  </svg>

  <svg
    v-else-if="name === 'policy'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M8.2 8.2a3.7 3.7 0 1 0-2.6 6.3" />
    <path d="M15.8 15.8a3.7 3.7 0 1 0 2.6-6.3" />
    <path d="M8.6 15.4 15.4 8.6" />
    <path d="M6.2 14.5h3.5v3.5" />
    <path d="M17.8 9.5h-3.5V6" />
  </svg>

  <svg
    v-else-if="name === 'file'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3H6.8A1.8 1.8 0 0 0 5 4.8v14.4A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V8z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 13h7" />
    <path d="M8.5 16.5h5" />
  </svg>

  <svg
    v-else-if="name === 'search'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="M16.2 16.2L21 21" />
  </svg>

  <svg
    v-else-if="name === 'refresh'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6v5h-5" />
    <path d="M4 18v-5h5" />
    <path d="M6.1 9A7.5 7.5 0 0 1 18.4 6.2L20 11" />
    <path d="M17.9 15A7.5 7.5 0 0 1 5.6 17.8L4 13" />
  </svg>

  <svg
    v-else-if="name === 'trash'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6.5 7l.8 13h9.4l.8-13" />
    <path d="M9 7V4h6v3" />
  </svg>

  <svg
    v-else-if="name === 'plus'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>

  <svg
    v-else-if="name === 'check'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.4l4.2 4.1L19 7" />
  </svg>

  <svg
    v-else-if="name === 'link'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M10.2 13.8a4.2 4.2 0 0 0 5.9 0l2.1-2.1a4.2 4.2 0 0 0-5.9-5.9l-1.2 1.2" />
    <path d="M13.8 10.2a4.2 4.2 0 0 0-5.9 0l-2.1 2.1a4.2 4.2 0 0 0 5.9 5.9l1.2-1.2" />
  </svg>

  <svg v-else-if="name === 'github'" :width="size" :height="size" viewBox="0 0 24 24" :fill="color" aria-hidden="true">
    <path
      d="M12 .3C5.4.3 0 5.7 0 12.3c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.8-1.6 8.2-6.1 8.2-11.4C24 5.7 18.6.3 12 .3Z"
    />
  </svg>

  <svg
    v-else-if="name === 'logout'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M10 7 5 12l5 5" />
    <path d="M5 12h10" />
    <path d="M13 4h4.2A2.8 2.8 0 0 1 20 6.8v10.4a2.8 2.8 0 0 1-2.8 2.8H13" />
  </svg>

  <svg
    v-else-if="name === 'docs'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5.8 4.2h5.1c1.1 0 2.1.4 2.9 1.2l.2.2.2-.2c.8-.8 1.8-1.2 2.9-1.2h1.1v14.9h-1.5c-1.1 0-2.1.4-2.9 1.2l-.8.8-.8-.8c-.8-.8-1.8-1.2-2.9-1.2H5.8z" />
    <path d="M14 5.6v15" />
    <path d="M8.5 8.3h2.9" />
    <path d="M8.5 11.2h2.9" />
  </svg>

  <svg
    v-else-if="name === 'down'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>

  <svg
    v-else-if="name === 'left'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>

  <svg
    v-else-if="name === 'right'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 18l6-6-6-6" />
  </svg>

  <svg
    v-else-if="name === 'more'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="fill"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="5" cy="12" r="1.3" :fill="color" stroke="none" />
    <circle cx="12" cy="12" r="1.3" :fill="color" stroke="none" />
    <circle cx="19" cy="12" r="1.3" :fill="color" stroke="none" />
  </svg>

  <svg v-else-if="name === 'cloud'" :width="size" :height="size" viewBox="0 0 48 32" fill="none" aria-hidden="true">
    <path fill="#fb6a13" d="M33.1 26.2H13.7A8.7 8.7 0 0 1 13.2 8.8a11.7 11.7 0 0 1 21.7 3.3A7.1 7.1 0 0 1 33.1 26.2Z" />
    <path fill="#fb6a13" d="M36.2 26.2h2.1A5.7 5.7 0 0 0 39 14.9a9.5 9.5 0 0 0-3.6.2 13.2 13.2 0 0 1 .9 4.7c0 2.4-.7 4.6-2 6.4h1.9Z" opacity=".78" />
  </svg>
</template>
