<script setup lang="ts">
// Operator-Übersicht (Issue #15): listet die onboardeten Nutzer mit ihrem
// Browser-Link (seit Issue #24 die Dashboard-Startseite) und MCP-Schreib-Link.
// Hinter GitHub-OAuth (middleware/admin.ts + OAuth-Callback): nur die
// allowlistete Betreiber-Identität erreicht die Seite.
// Rein lesend — keine Re-Seed-/Rotate-/Deboard-Aktionen. Die MCP-Schreib-URL ist
// das hochwertigste Secret und wird daher nie im Klartext gerendert, nur kopiert.
//
// Zwei Arten von Ziel, deshalb zwei Felder je Nutzer: „öffnen" navigiert über den
// host-freien viewPath im selben Deployment und Tab (lokal bleibt lokal, und der
// Admin-Eintrag der Kopfzeile führt zurück), „kopieren" gibt die absolute URL für
// den Nutzer aus — dieselbe Prod-Basis wie bei der MCP-URL.
import type { OnboardedUser } from '@shared/cli/operatorDirectory'

const { user, clear } = useUserSession()
const toast = useToast()

useHead({ title: 'Admin' })

const { data: users, pending, error } = await useFetch<OnboardedUser[]>('/api/admin/users')

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${label} kopiert`, color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Kopieren fehlgeschlagen', color: 'error', icon: 'i-lucide-x' })
  }
}

// Abmelden endet auf der öffentlichen Startseite. Nicht auf /auth/github: dort würde
// GitHub die noch offene Sitzung sofort wieder durchreichen — abgemeldet und im selben
// Atemzug neu angemeldet, was wie ein wirkungsloser Klick aussieht.
async function logout() {
  await clear()
  await navigateTo('/')
}
</script>

<template>
  <div class="flex flex-1 flex-col">
    <AppHeader aktiv>
      <div class="flex-1" />

      <div class="flex items-center gap-3">
        <UAvatar :src="user?.avatarUrl" :alt="user?.name" size="xs" />
        <span class="text-sm text-muted">{{ user?.name }} (@{{ user?.login }})</span>
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-log-out" @click="logout">
          Abmelden
        </UButton>
      </div>
    </AppHeader>

    <UContainer class="w-full flex-1 py-10">
      <h1 class="mb-6 text-xl font-semibold">Nutzer</h1>

      <div v-if="pending" class="text-muted">Lade Nutzer …</div>
      <UAlert
        v-else-if="error"
        color="error"
        icon="i-lucide-triangle-alert"
        title="Nutzer konnten nicht geladen werden"
        :description="error.statusMessage || 'Unbekannter Fehler'"
      />
      <p v-else-if="!users?.length" class="text-muted">Noch keine Nutzer onboardet.</p>

      <div v-else class="flex flex-col gap-4">
        <UCard v-for="u in users" :key="u.userId">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <!-- Identität + geseedete Kontexte -->
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-user-round" class="size-5 text-muted" />
              <div>
                <p class="font-medium">{{ u.userId }}</p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <UBadge
                    v-if="u.seededContexts.finalSurge"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    Final Surge
                  </UBadge>
                  <UBadge
                    v-if="u.seededContexts.garmin"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    Garmin
                  </UBadge>
                  <UBadge
                    v-if="u.seededContexts.view"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    View
                  </UBadge>
                </div>
              </div>
            </div>

            <!-- Aktionen: in den Bereich springen + URLs kopieren -->
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="u.viewPath"
                :to="u.viewPath"
                color="primary"
                variant="solid"
                icon="i-lucide-arrow-right"
              >
                Dashboard öffnen
              </UButton>
              <UButton
                v-if="u.viewUrl"
                color="neutral"
                variant="subtle"
                icon="i-lucide-copy"
                @click="copy(u.viewUrl, 'Dashboard-URL')"
              >
                Dashboard-URL
              </UButton>
              <UButton
                color="neutral"
                variant="subtle"
                icon="i-lucide-key-round"
                @click="copy(u.mcpUrl, 'MCP-URL')"
              >
                MCP-URL
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>
