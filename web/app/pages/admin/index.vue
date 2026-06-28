<script setup lang="ts">
// Operator-Platzhalterseite (Issue #14, ADR-0005). Hinter GitHub-OAuth: nur die
// allowlistete Betreiber-Identität erreicht sie überhaupt (server/middleware/admin.ts +
// OAuth-Callback). Inhalt — die onboardeten Nutzer samt View-/MCP-Links — folgt im
// nächsten Slice (#5). Hier nur der Auth-Tracer: eingeloggter Operator sieht sich selbst.
const { user, clear } = useUserSession()

useHead({ title: 'Admin' })

async function logout() {
  await clear()
  await navigateTo('/auth/github', { external: true })
}
</script>

<template>
  <UContainer class="py-10">
    <div class="mb-8 flex items-center gap-3">
      <UAvatar :src="user?.avatarUrl" :alt="user?.name" size="lg" />
      <div>
        <h1 class="text-xl font-semibold">Admin</h1>
        <p class="text-sm text-muted">
          Angemeldet als {{ user?.name }} (@{{ user?.login }})
        </p>
      </div>
      <div class="flex-1" />
      <UButton color="neutral" variant="subtle" icon="i-lucide-log-out" @click="logout">
        Abmelden
      </UButton>
    </div>

    <UCard>
      <p class="text-muted">
        Operator-Fläche. Die Nutzerliste mit View- und MCP-Links folgt im nächsten Slice.
      </p>
    </UCard>
  </UContainer>
</template>
