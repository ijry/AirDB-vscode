<template>
  <div class="ml-4">
    <div class="mb-3">
      <div class="mr-10 mb-3">
        <label class="inline-block mr-5 font-bold w-14">
          {{$t('Design.Table')}}
          <span class="mr-1 text-red-600">*</span>
        </label>
        <el-input size="small"  class="w-64" required v-model="table.name" />
      </div>
      <div class="flex justify-start items-end">
        <div class="inline-block flex flex-1 mr-10">
          <label class="inline-block w-14 mr-5 font-bold">
            {{$t('Design.Comment')}}
            <span class="mr-1 text-red-600">*</span>
          </label>
          <el-input size="small" rows="2" type="textarea" class="w-2/3" v-model="table.comment" />
        </div>
        <div class="px-4">
          <el-button @click="rename" size="small" type="default">{{ $t('Design.Update') }}</el-button>
        </div>
      </div>
      <div>
          <!-- 自增值 -->
          <!-- 存储引擎 -->
          <!-- 字符集 -->
          <!-- 字符排序规则 -->
          <!-- 行格式 -->
      </div>
    </div>
  </div>
</template>

<script>
import { wrapByDb } from "@/common/wrapper";
import { inject } from "../mixin/vscodeInject";
export default {
  mixins: [inject],
  data() {
    return {
      designData: { table: null, dbType: null },
      table: {
        name: null,
        comment: null,
        visible: false,
        loading: false,
        type: null,
      },
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.designData = data;
      this.table.name = data.table;
      this.table.comment = data.comment;
      this.designData.editIndex = [...this.designData.indexs];
    })
      .on("success", () => {
        this.$message.success(this.$t("Update Success")+ "!");
        this.init();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      })
      .init();
  },
  methods: {
    rename() {
      this.emit("updateTable", {
        newTableName: this.table.name,
        newComment: this.table.comment,
      });
    },
    createIndex() {
      this.index.loading = true;
      this.execute(
        `ALTER TABLE ${wrapByDb(this.designData.table, this.designData.dbType)} ADD ${this.index.type} (${wrapByDb(
          this.index.column,
          this.designData.dbType
        )})`
      );
    },
    execute(sql) {
      if (!sql) return;
      this.emit("execute", sql);
    },
  },
};
</script>

<style>
.field__input {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-dropdown-border);
  color: var(--vscode-input-foreground);
  padding: 4px;
  margin: 2px 0;
}

.field__input:focus {
  border-color: inherit;
  outline: 0;
}
</style>
