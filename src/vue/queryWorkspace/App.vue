<template>
  <div id="query-workspace">
    <div class="query-workspace__editor">
      <el-input
        class="sql-pannel"
        type="textarea"
        :autosize="{ minRows: 6, maxRows: 12 }"
        v-model="sql"
        @keypress.native="panelInput"
      />
      <div class="query-workspace__actions">
        <el-button size="small" type="primary" icon="el-icon-caret-right" @click="runSql">执行</el-button>
        <el-button size="small" icon="el-icon-download" @click="exportOption.visible = true" :disabled="!result.data.length">导出</el-button>
        <span class="query-workspace__status" v-if="info.message" :class="{ error: info.error }" @click="resultDialog = true">
          {{ info.error ? "Error" : "Success" }}
        </span>
        <span class="query-workspace__cost">Cost: {{ result.costTime || 0 }}ms</span>
      </div>
    </div>

    <ux-grid
      ref="dataTable"
      :data="filterData"
      v-loading="loading"
      size="small"
      :height="remainHeight"
      width="100vw"
      stripe
    >
      <ux-table-column type="index" width="48" align="center"></ux-table-column>
      <ux-table-column
        v-for="field in result.fields || []"
        :key="field.name"
        :field="field.name"
        :title="field.name"
        :minWidth="computeWidth(field, 0)"
        :resizable="true"
      >
        <template slot-scope="scope">
          <span v-if="scope.row[field.name] === null || scope.row[field.name] === undefined" class="null-column">(NULL)</span>
          <span v-else>{{ formatValue(scope.row[field.name]) }}</span>
        </template>
      </ux-table-column>
    </ux-grid>

    <div class="query-workspace__footer">
      <el-pagination
        small
        layout="prev, pager, next, total"
        :current-page="page.pageNum"
        :page-size="page.pageSize"
        :total="page.total || 0"
        @current-change="jumpPage"
      ></el-pagination>
    </div>

    <el-dialog title="Result" :visible.sync="resultDialog" top="5vh">
      <div v-html="info.message"></div>
      <div class="query-workspace__dialog-sql">SQL: {{ info.sql }}</div>
    </el-dialog>

    <ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import ExportDialog from "../result/component/ExportDialog.vue";

let vscodeEvent;

export default {
  components: { ExportDialog },
  data() {
    return {
      sql: "",
      loading: false,
      remainHeight: 420,
      resultDialog: false,
      result: { data: [], fields: [], costTime: 0, sql: "", table: null },
      page: { pageNum: 1, pageSize: 100, total: 0 },
      table: { widthItem: {}, search: "" },
      info: { message: null, sql: null, error: false },
      exportOption: { visible: false },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("message", this.handleMessage);
    vscodeEvent.emit("init");
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("message", this.handleMessage);
  },
  computed: {
    filterData() {
      return this.result.data || [];
    },
  },
  methods: {
    handleMessage({ data }) {
      if (!data) return;
      const response = data.content || {};
      this.loading = false;
      switch (data.type) {
        case "RUN":
          this.sql = response.sql || this.sql;
          this.loading = !!response.sql;
          break;
        case "DATA":
          this.result = response;
          this.sql = response.sql || this.sql;
          this.result.data = response.data || [];
          this.result.fields = response.fields || [];
          this.table.widthItem = {};
          this.page.pageSize = response.pageSize || this.page.pageSize;
          this.page.total = response.total != null ? parseInt(response.total) : this.result.data.length;
          this.info.message = null;
          this.info.error = false;
          break;
        case "NEXT_PAGE":
          this.result.data = response.data || [];
          this.result.costTime = response.costTime;
          this.result.sql = response.sql;
          this.table.widthItem = {};
          break;
        case "COUNT":
          this.page.total = parseInt(response.data);
          break;
        case "DML":
        case "DDL":
        case "MESSAGE_BLOCK":
          this.info = { message: response.message, sql: response.sql, error: false };
          this.result.costTime = response.costTime;
          break;
        case "ERROR":
          this.info = { message: response.message, sql: response.sql, error: true };
          break;
        case "EXPORT_DONE":
          this.exportOption.visible = false;
          break;
      }
    },
    resize() {
      this.remainHeight = Math.max(240, window.innerHeight - 190);
    },
    panelInput(event) {
      if (event.code === "Enter" && event.ctrlKey) {
        this.runSql();
        event.stopPropagation();
      }
    },
    runSql() {
      if (!this.sql || !this.sql.trim()) return;
      this.loading = true;
      this.info.message = null;
      vscodeEvent.emit("execute", { sql: this.sql });
    },
    jumpPage(pageNum) {
      this.page.pageNum = pageNum;
      vscodeEvent.emit("next", {
        sql: this.result.sql || this.sql,
        pageNum,
        pageSize: this.page.pageSize,
      });
      this.loading = true;
    },
    confirmExport(exportOption) {
      vscodeEvent.emit("export", {
        option: { ...exportOption, sql: this.result.sql || this.sql, table: this.result.table },
      });
    },
    formatValue(value) {
      if (value && value.hasOwnProperty && value.hasOwnProperty("type")) {
        return String.fromCharCode.apply(null, new Uint16Array(value.data));
      }
      return value;
    },
    computeWidth(field, index) {
      const key = field.name;
      if (this.table.widthItem[key]) return this.table.widthItem[key];
      if (!this.result.data[index] || index > 10) return 90;
      const value = this.result.data[index][key];
      let width = Math.max((key + "").length * 10, (value + "").length * 10, 90);
      width = Math.min(width, 180);
      const next = this.computeWidth(field, index + 1);
      this.table.widthItem[key] = Math.max(width, next);
      return this.table.widthItem[key];
    },
  },
};
</script>

<style scoped>
#query-workspace {
  padding: 8px 10px 0;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

.query-workspace__editor {
  border-bottom: 1px solid var(--vscode-textBlockQuote-background);
  padding-bottom: 6px;
}

.query-workspace__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
}

.query-workspace__status {
  cursor: pointer;
  color: #15d422;
}

.query-workspace__status.error {
  color: #d81e06;
}

.query-workspace__cost {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

.query-workspace__footer {
  border-top: 1px solid var(--vscode-textBlockQuote-background);
  padding-top: 2px;
}

.query-workspace__dialog-sql {
  margin-top: 10px;
}
</style>
