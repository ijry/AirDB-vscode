<template>
  <div>
    <div class="design-toolbar mt-2 mb-3">
      <el-button @click="index.visible=true" type="default" title="Insert"
        icon="el-icon-circle-plus-outline" size="small">{{ $t('Add Index') }}</el-button>
    </div>
    <ux-grid :data="designData.editIndex" stripe style="width: 100%" :cell-style="{height: '35px'}">
      <ux-table-column align="center" field="index_name" :title="$t('Index Name')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="column_name" :title="$t('Column Name')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="non_unique" :title="$t('Non Qnique')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="index_type" :title="$t('Index Type')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column :title="$t('Operation')" width="120">
        <template v-slot="{ row }">
          <el-button @click="deleteConfirm(row)" :title="$t('delete')"
            type="danger" size="mini" icon="el-icon-delete" circle> </el-button>
        </template>
      </ux-table-column>
    </ux-grid>
    <el-dialog :title="$t('Add Index')" :visible.sync="index.visible" top="5vh" size="mini">
      <el-form :inline='true' label-width="100px" label-suffix=":">
        <el-form-item :label="$t('Design.Column')" required>
          <el-select v-model="index.column">
            <el-option :label="column.name" :value="column.name" :key="column.name" v-for="column in designData.columnList"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Index Type" required>
          <el-select v-model="index.type">
            <el-option :label="'UNIQUE'" value="UNIQUE"></el-option>
            <el-option :label="'INDEX'" value="INDEX"></el-option>
            <el-option :label="'PRIMARY KEY'" value="PRIMARY KEY"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button size="medium" type="primary" :loading="index.loading" @click="createIndex">{{ $t('Design.Create') }}</el-button>
        <el-button size="medium" @click="index.visible=false">{{ $t('Cancel') }}</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { wrapByDb } from "@/common/wrapper";
import { inject } from "../mixin/vscodeInject";
export default {
  mixins: [inject],
  data() {
    return {
      designData: { indexs: [], table: null, dbType: null, columnList: [] },
      index: {
        visible: false,
        loading: false,
        column: null,
        type: null,
      },
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.designData = data;
      this.designData.editIndex = [...this.designData.indexs];
    })
      .on("success", () => {
        this.index.loading = false;
        this.index.visible = false;
        this.init();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      })
      .init();
  },
  methods: {
    createIndex() {
      this.index.loading = true;
      this.emit("createIndex", {
        column: this.index.column,
        type: this.index.type,
        indexType: this.index.indexType,
      });
    },
    deleteConfirm(row) {
      this.$confirm("Are you sure you want to delete this index?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      }).then(() => {
        this.emit("dropIndex",row.index_name)
      });
    },
    execute(sql) {
      if (!sql) return;
      this.emit("execute", sql);
    },
  },
};
</script>

<style>
</style>