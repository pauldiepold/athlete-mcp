<script setup lang="ts">
// Geschützter Einstieg (Issue #14). Wer hier ankommt, ist bereits Operator — die
// Middleware (server/middleware/admin.ts) schickt unangemeldete Zugriffe vorher in den
// GitHub-Login. Von hier direkt weiter auf die Admin-Fläche.
await navigateTo('/admin', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
