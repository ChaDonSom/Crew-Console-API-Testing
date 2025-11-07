<!-- pages/index.vue -->
<template>
  <main class="min-h-screen bg-slate-100 px-4 py-6">
    <section class="board mx-auto max-w-5xl rounded-[26px] border border-slate-200 bg-white px-3 pb-5 pt-4 shadow-lg">
      <!-- Header row -->
      <header class="grid grid-cols-[minmax(0,1fr)_220px_200px] items-center px-3 pt-1 pb-2">
        <div></div>
        <div class="text-center text-sm font-semibold text-slate-500">Download Template</div>
        <div class="text-center text-sm font-semibold text-slate-500">Upload .csv file</div>
      </header>

      <!-- Rows -->
      <ImportRow
        v-for="item in rows"
        :key="item.key"
        :item="item"
        :disabled="isUploading(item.key)"
        @download="downloadTemplate"
        @request-upload="handleUploadClick"
      />

      <!-- Console / Summaries + errors -->
      <ImportConsole
        :empSummary="summaries.employees.value"
        :staffSummary="summaries.staff.value"
        :equipSummary="summaries.equipment.value"
        :jobsSummary="summaries.jobs.value"
        :tasksSummary="summaries.tasks.value"
        :customersSummary="summaries.customers.value"
        :empErrors="errors.employees.value"
        :staffErrors="errors.staff.value"
        :equipErrors="errors.equipment.value"
        :jobsErrors="errors.jobs.value"
        :tasksErrors="errors.tasks.value"
        :customersErrors="errors.customers.value"
      />
    </section>

    <!-- Hidden file inputs (implementation detail only) -->
    <input
      ref="empInput"
      type="file"
      class="hidden"
      accept=".csv,text/csv"
      aria-hidden="true"
      tabindex="-1"
      @change="onPicked($event, 'employees')"
    />
    <input
      ref="staffInput"
      type="file"
      class="hidden"
      accept=".csv,text/csv"
      aria-hidden="true"
      tabindex="-1"
      @change="onPicked($event, 'staff')"
    />
    <input
      ref="equipInput"
      type="file"
      class="hidden"
      accept=".csv,text/csv"
      aria-hidden="true"
      tabindex="-1"
      @change="onPicked($event, 'equipment')"
    />
    <input
      ref="jobsInput"
      type="file"
      class="hidden"
      accept=".csv,text/csv"
      aria-hidden="true"
      tabindex="-1"
      @change="onPicked($event, 'jobs')"
    />
    <input
      ref="tasksInput"
      type="file"
      class="hidden"
      accept=".csv,text/csv"
      aria-hidden="true"
      tabindex="-1"
      @change="onPicked($event, 'tasks')"
    />
    <input
      ref="customersInput"
      type="file"
      class="hidden"
      accept=".csv,text/csv"
      aria-hidden="true"
      tabindex="-1"
      @change="onPicked($event, 'customers')"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue"
import ImportRow from "~/components/imports/ImportRow.vue"
import ImportConsole from "~/components/imports/ImportConsole.vue"
import { rows, type ImportRow as Row } from "~/data/importRows"
import { useUploader } from "~/composables/useUploader"
import { useImportState, type ImportKey } from "~/composables/useImportState"

// --- File input refs ---
const empInput = ref<HTMLInputElement | null>(null)
const staffInput = ref<HTMLInputElement | null>(null)
const equipInput = ref<HTMLInputElement | null>(null)
const jobsInput = ref<HTMLInputElement | null>(null)
const tasksInput = ref<HTMLInputElement | null>(null)
const customersInput = ref<HTMLInputElement | null>(null)

// 🔁 Centralized import state (summaries, errors, uploading)
const { uploading, summaries, errors, isUploading, resetFor } = useImportState()

// Helpers from composable
const { downloadTemplate, doUpload } = useUploader()

function handleUploadClick(key: Row["key"]) {
  if (key === "employees") empInput.value?.click()
  else if (key === "staff") staffInput.value?.click()
  else if (key === "equipment") equipInput.value?.click()
  else if (key === "jobs") jobsInput.value?.click()
  else if (key === "tasks") tasksInput.value?.click()
  else if (key === "customers") customersInput.value?.click()
}

// Map row key -> endpoint/label
const endpointMap: Record<ImportKey, { endpoint: string; label: string; inputRef: any }> = {
  employees: {
    endpoint: "/api/crew/employees",
    label: "Employees & Foreman",
    inputRef: empInput,
  },
  staff: {
    endpoint: "/api/crew/staff",
    label: "Staff",
    inputRef: staffInput,
  },
  equipment: {
    endpoint: "/api/crew/equipment",
    label: "Equipment",
    inputRef: equipInput,
  },
  jobs: {
    endpoint: "/api/crew/jobs",
    label: "Jobs",
    inputRef: jobsInput,
  },
  tasks: {
    endpoint: "/api/crew/tasks",
    label: "Tasks",
    inputRef: tasksInput,
  },
  customers: {
    endpoint: "/api/crew/customers",
    label: "Customers",
    inputRef: customersInput,
  },
}

async function onPicked(e: Event, key: ImportKey) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  // Only clear THIS entity's console
  resetFor(key)
  uploading[key].value = true

  const { endpoint, label, inputRef } = endpointMap[key]

  try {
    const { summaryLine, rowErrors } = await doUpload(file, endpoint, label)
    summaries[key].value = summaryLine
    errors[key].value = rowErrors
  } finally {
    if (inputRef.value) inputRef.value.value = ""
    uploading[key].value = false
    await nextTick()
    document.querySelector(".board")?.scrollIntoView({ behavior: "smooth", block: "end" })
  }
}
</script>

<!-- No <style scoped> needed; all layout done via Tailwind utilities -->
