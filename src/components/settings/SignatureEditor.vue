<script setup lang="ts">
// Edits an account's list of named signatures: add, rename, delete, pick
// the default, and import an HTML signature file. The parent persists the
// list when the account is saved.
import { computed, ref, watch } from "vue";
import type { AccountSignature } from "@/lib/types";
import * as api from "@/lib/tauri";
import { isHtmlSignature } from "@/lib/signature";
import SignaturePreview from "@/components/common/SignaturePreview.vue";
import { t } from "@/i18n";

const signatures = defineModel<AccountSignature[]>({ required: true });

const selectedId = ref<string | null>(null);
const importError = ref<string | null>(null);
const importing = ref(false);

const selected = computed(
  () => signatures.value.find((s) => s.id === selectedId.value) ?? null,
);

// Keep a valid selection as the list is replaced (account load) or edited.
watch(
  () => signatures.value.map((s) => s.id).join("|"),
  () => {
    if (!signatures.value.some((s) => s.id === selectedId.value)) {
      selectedId.value =
        signatures.value.find((s) => s.is_default)?.id ?? signatures.value[0]?.id ?? null;
    }
  },
  { immediate: true },
);

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // Fall through to the time-based id.
  }
  return `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addSignature(name = "", body = ""): AccountSignature {
  const entry: AccountSignature = {
    id: newId(),
    name: name || t("Signature {n}", { n: signatures.value.length + 1 }),
    body,
    is_default: signatures.value.length === 0,
  };
  signatures.value = [...signatures.value, entry];
  selectedId.value = entry.id;
  return entry;
}

function update(id: string, patch: Partial<AccountSignature>) {
  signatures.value = signatures.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function setDefault(id: string) {
  signatures.value = signatures.value.map((s) => ({ ...s, is_default: s.id === id }));
}

function remove(id: string) {
  const removed = signatures.value.find((s) => s.id === id);
  const rest = signatures.value.filter((s) => s.id !== id);
  if (removed?.is_default && rest.length > 0) {
    rest[0] = { ...rest[0], is_default: true };
  }
  signatures.value = rest;
}

/** Import into a new signature, or replace the body of `target`. */
async function importFile(target: AccountSignature | null) {
  importError.value = null;
  importing.value = true;
  try {
    const file = await api.pickSignatureFile();
    if (!file) return;
    if (target) {
      update(target.id, { body: file.content });
    } else {
      addSignature(file.name, file.content);
    }
  } catch (e) {
    importError.value = t("Could not read the file: {error}", {
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <div class="signature-editor" data-testid="signature-editor">
    <div class="sig-actions">
      <button type="button" class="sig-btn" data-testid="signature-add" @click="addSignature()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {{ t("New signature") }}
      </button>
      <button
        type="button"
        class="sig-btn"
        data-testid="signature-import"
        :disabled="importing"
        @click="importFile(null)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        {{ t("Import an HTML file…") }}
      </button>
    </div>
    <p v-if="importError" class="sig-error" role="alert">{{ importError }}</p>

    <p v-if="!signatures.length" class="sig-empty" data-testid="signature-empty">
      {{ t("No signature yet. Create one, or import the HTML file of an existing signature.") }}
    </p>

    <div v-else class="sig-layout">
      <ul class="sig-list" role="listbox" :aria-label="t('Signatures')">
        <li
          v-for="sig in signatures"
          :key="sig.id"
          role="option"
          class="sig-item"
          :class="{ active: sig.id === selectedId }"
          :aria-selected="sig.id === selectedId"
          data-testid="signature-item"
          tabindex="0"
          @click="selectedId = sig.id"
          @keydown.enter.prevent="selectedId = sig.id"
        >
          <span class="sig-item-name">{{ sig.name || t("Untitled") }}</span>
          <span class="sig-item-meta">
            <span v-if="isHtmlSignature(sig.body)" class="sig-tag">HTML</span>
            <span v-if="sig.is_default" class="sig-tag default">{{ t("Default") }}</span>
          </span>
        </li>
      </ul>

      <div v-if="selected" class="sig-detail">
        <div class="form-group">
          <label :for="`sig-name-${selected.id}`">{{ t("Name") }}</label>
          <input
            :id="`sig-name-${selected.id}`"
            type="text"
            :value="selected.name"
            data-testid="signature-name"
            @input="update(selected.id, { name: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <div class="form-group">
          <label :for="`sig-body-${selected.id}`">{{ t("Content") }}</label>
          <textarea
            :id="`sig-body-${selected.id}`"
            class="sig-textarea"
            rows="7"
            :value="selected.body"
            data-testid="signature-body"
            placeholder="-- &#10;Ada Lovelace&#10;Analyste"
            @input="update(selected.id, { body: ($event.target as HTMLTextAreaElement).value })"
          ></textarea>
          <span class="field-hint">
            {{ isHtmlSignature(selected.body)
              ? t("HTML signature — added below the message and sent as HTML.")
              : t("Plain text, or paste the HTML of a signature file.") }}
          </span>
        </div>

        <div v-if="isHtmlSignature(selected.body)" class="sig-preview">
          <div class="sig-preview-label">{{ t("Preview") }}</div>
          <SignaturePreview :html="selected.body" />
        </div>

        <div class="sig-detail-actions">
          <label class="sig-default">
            <input
              type="radio"
              name="default-signature"
              :checked="selected.is_default"
              data-testid="signature-default"
              @change="setDefault(selected.id)"
            />
            {{ t("Use by default for new messages") }}
          </label>
          <span class="spacer"></span>
          <button
            type="button"
            class="sig-btn"
            :disabled="importing"
            data-testid="signature-replace"
            @click="importFile(selected)"
          >{{ t("Replace from file…") }}</button>
          <button
            type="button"
            class="sig-btn danger"
            data-testid="signature-delete"
            @click="remove(selected.id)"
          >{{ t("Delete") }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.signature-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sig-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sig-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12.5px;
  transition: background 0.12s, border-color 0.12s;
}

.sig-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-heavy);
}

.sig-btn:disabled {
  opacity: 0.5;
}

.sig-btn.danger {
  color: var(--color-danger-text);
}

.sig-btn.danger:hover {
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border-color: var(--color-danger);
}

.sig-error {
  font-size: 12px;
  color: var(--color-danger-text);
}

.sig-empty {
  padding: 20px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
  text-align: center;
}

.sig-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.sig-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  flex: 0 0 200px;
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.sig-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.sig-item:hover {
  background: var(--color-bg-hover);
}

.sig-item.active {
  background: var(--color-accent-light);
}

.sig-item-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sig-item.active .sig-item-name {
  color: var(--color-accent);
}

.sig-item-meta {
  display: flex;
  gap: 4px;
}

.sig-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 4px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
}

.sig-tag.default {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.sig-detail {
  flex: 1 1 300px;
  min-width: 0;
}

.sig-textarea {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: 'Liberation Mono', monospace;
  border: 0.8px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  resize: vertical;
}

.sig-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-light);
}

.sig-preview {
  margin-bottom: 16px;
}

.sig-preview-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.sig-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sig-default {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
}

.spacer {
  flex: 1;
}
</style>
