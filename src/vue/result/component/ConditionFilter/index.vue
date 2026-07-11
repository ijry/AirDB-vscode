<template>
  <div class="condition-filter">
    <div
      v-for="(row, index) in localFilters"
      :key="row.id || index"
      class="condition-filter__row"
      :class="{ 'condition-filter__row--disabled': !row.enabled }"
    >
      <el-checkbox v-model="row.enabled" @change="emitFilters"></el-checkbox>

      <el-select
        v-model="row.field"
        size="small"
        class="condition-filter__field"
        filterable
        @change="onFieldChange(row)"
      >
        <el-option
          v-for="field in fieldOptions"
          :key="field.value"
          :label="field.label"
          :value="field.value"
        ></el-option>
      </el-select>

      <el-select
        v-if="row.field !== RAW_SQL_FIELD"
        v-model="row.operator"
        size="small"
        class="condition-filter__operator"
        @change="emitFilters"
      >
        <el-option
          v-for="operator in operators"
          :key="operator"
          :label="operator"
          :value="operator"
        ></el-option>
      </el-select>
      <div v-else class="condition-filter__operator-placeholder"></div>

      <el-input
        v-model="row.value"
        size="small"
        class="condition-filter__value"
        :placeholder="row.field === RAW_SQL_FIELD ? 'Raw SQL' : '值'"
        @input="emitFilters"
        @keyup.enter="applyRow(index)"
        @keyup.ctrl.enter="applyAll"
      ></el-input>

      <el-tooltip content="应用" placement="bottom" :open-delay="350">
        <el-button size="small" @click="applyRow(index)"><el-icon><CaretRight /></el-icon></el-button>
      </el-tooltip>
      <el-tooltip content="删除条件" placement="bottom" :open-delay="350">
        <el-button size="small" @click="removeRow(index)"><el-icon><Minus /></el-icon></el-button>
      </el-tooltip>
      <el-tooltip content="添加条件" placement="bottom" :open-delay="350">
        <el-button size="small" @click="addRow(index + 1)"><el-icon><Plus /></el-icon></el-button>
      </el-tooltip>
    </div>

    <div class="condition-filter__footer">
      <el-tooltip content="添加条件" placement="bottom" :open-delay="350">
        <el-button size="small" @click="addRow(localFilters.length)"><el-icon><Operation /></el-icon></el-button>
      </el-tooltip>
      <el-button size="small" @click="$emit('clear')">清除过滤器</el-button>
      <el-popover placement="bottom-start" width="520" trigger="click">
        <pre class="condition-filter__sql">{{ generatedSql }}</pre>
        <template #reference>
          <el-button size="small">SQL</el-button>
        </template>
      </el-popover>
      <span class="condition-filter__spacer"></span>
      <el-button size="small" type="primary" @click="applyAll">全部应用</el-button>
    </div>
  </div>
</template>

<script>
import { CaretRight, Minus, Operation, Plus } from '@element-plus/icons-vue';

const {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
} = require("../../util/tableFilterSql");

export default {
  components: { CaretRight, Minus, Operation, Plus },
  props: {
    fields: { type: Array, default: () => [] },
    columnList: { type: Array, default: () => [] },
    filters: { type: Array, default: () => [] },
    generatedSql: { type: String, default: "" },
  },
  emits: ["update:filters", "apply-row", "apply-all", "clear"],
  data() {
    return {
      RAW_SQL_FIELD,
      operators: ["=", "<>", ">", ">=", "<", "<=", "LIKE", "NOT LIKE", "IS NULL", "IS NOT NULL"],
      localFilters: [],
    };
  },
  computed: {
    fieldOptions() {
      const seen = {};
      const fields = (this.fields || [])
        .filter((field) => field && field.name && !seen[field.name] && (seen[field.name] = true))
        .map((field) => ({ label: field.name, value: field.name }));

      return [{ label: "Raw SQL", value: RAW_SQL_FIELD }, ...fields];
    },
  },
  watch: {
    filters: {
      immediate: true,
      deep: true,
      handler(value) {
        this.localFilters = (value || []).map((row, index) => ({
          id: row.id || `${Date.now()}-${index}`,
          enabled: row.enabled !== false,
          field: row.field || RAW_SQL_FIELD,
          operator: row.operator || "=",
          value: row.value || "",
          type: row.type,
        }));
      },
    },
  },
  methods: {
    makeRow() {
      const row = {
        id: `${Date.now()}-${Math.random()}`,
        ...createDefaultFilterRow(this.fields),
      };
      this.syncRowType(row);
      return row;
    },
    syncRowType(row) {
      const column = (this.columnList || []).find((item) => item.name === row.field);
      row.type = column ? (column.simpleType || column.type) : undefined;
    },
    emitFilters() {
      this.$emit("update:filters", this.localFilters.map((row) => ({ ...row })));
    },
    addRow(index) {
      this.localFilters.splice(index, 0, this.makeRow());
      this.emitFilters();
    },
    removeRow(index) {
      this.localFilters.splice(index, 1);
      if (this.localFilters.length === 0) {
        this.localFilters.push(this.makeRow());
      }
      this.emitFilters();
    },
    onFieldChange(row) {
      if (row.field === RAW_SQL_FIELD) {
        row.operator = "=";
        row.type = undefined;
      } else {
        this.syncRowType(row);
      }
      this.emitFilters();
    },
    applyRow(index) {
      this.emitFilters();
      this.$emit("apply-row", index);
    },
    applyAll() {
      this.emitFilters();
      this.$emit("apply-all");
    },
  },
};
</script>

<style scoped>
.condition-filter {
  border-bottom: 1px solid var(--vscode-textBlockQuote-background);
  padding: 4px 0;
}

.condition-filter__row {
  display: grid;
  grid-template-columns: 24px minmax(110px, 160px) 104px minmax(150px, 1fr) 32px 32px 32px;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}

.condition-filter__row--disabled {
  opacity: 0.55;
}

.condition-filter__field,
.condition-filter__operator,
.condition-filter__operator-placeholder,
.condition-filter__value {
  min-width: 0;
}

.condition-filter__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}

.condition-filter__spacer {
  flex: 1;
}

.condition-filter__sql {
  margin: 0;
  white-space: pre-wrap;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

.condition-filter :deep(.el-button--small) {
  padding: 6px 8px;
}

.condition-filter :deep(.el-button .el-icon) {
  margin: 0;
}
</style>
