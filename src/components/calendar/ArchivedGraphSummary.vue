<script setup lang="ts">
import { t } from "@/i18n";
import type { ArchivedGraphCalendar } from "@/lib/types";
import { useAccountsStore } from "@/stores/accounts";

defineProps<{ calendars: ArchivedGraphCalendar[] }>();
const accounts = useAccountsStore();

function accountName(accountId: string): string {
  return accounts.accounts.find((account) => account.id === accountId)?.display_name
    ?? accountId;
}
</script>

<template>
  <ul class="archived-graph-summary">
    <li v-for="calendar in calendars" :key="calendar.id">
      {{ accountName(calendar.account_id) }} · {{ calendar.name }}:
      {{ t("{events} cached event(s), {addresses} replay address(es)", { events: calendar.retained_event_count, addresses: calendar.replay_address_count }) }}
      <span v-if="calendar.acknowledged">· {{ t('Acknowledged') }}</span>
    </li>
  </ul>
</template>

<style scoped>
.archived-graph-summary {
  margin: 4px 0;
  padding-left: 20px;
}
</style>
