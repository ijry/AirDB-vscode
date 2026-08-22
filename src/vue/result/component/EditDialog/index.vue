<template>
  <el-dialog
    ref="editDialog"
    :title="editorTilte"
    v-model="visible"
    width="70%"
    top="50px"
    :close-on-click-modal="false"
    destroy-on-close
    class="edit-dialog"
  >
    <el-form ref="infoForm" :model="editModel" label-position="top" class="edit-dialog__form">
      <el-form-item
        v-for="column in safeColumnList"
        :key="column.name"
        :prop="column.name"
        class="edit-dialog__item"
      >
        <template #label>
          <span class="edit-dialog__label">
            <span v-if="column.comment">{{ column.comment }}:</span>
            <span class="edit-dialog__name">{{ column.name }}</span>
            <span class="edit-dialog__type">: {{ column.type }}</span>
            <span v-if="column.key || column.nullable !== 'YES'" class="edit-dialog__meta">
              {{ column.key }}{{ column.nullable === 'YES' ? '' : ' NOT NULL' }}
            </span>
            <span v-if="column.defaultValue" class="edit-dialog__meta">
              Default : {{ column.defaultValue }}
            </span>
            <span v-if="column.extra === 'auto_increment'" class="edit-dialog__meta">
              AUTO_INCREMENT
            </span>
          </span>
        </template>
        <CellEditor v-model="editModel[column.name]" :type="column.type" />
      </el-form-item>
      <div v-if="!safeColumnList.length" class="edit-dialog__empty">
        未获取到列信息，请先查询表数据后再插入。
      </div>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button size="default" @click="visible = false">{{ $t('Cancel') }}</el-button>
        <el-button
          v-if="model === 'update'"
          type="primary"
          size="default"
          :loading="loading"
          @click="confirmUpdate(editModel)"
        >
          {{ $t('Update') }}
        </el-button>
        <el-button
          v-if="model === 'insert' || model === 'copy'"
          type="primary"
          size="default"
          :loading="loading"
          @click="confirmInsert(editModel)"
        >
          {{ $t('Insert') }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script>
import CellEditor from "./CellEditor.vue";
import { util } from "../../mixin/util";
import { wrapByDb } from "@/common/wrapper";
import { toBindValue, quoteLiteral, isTextType } from "@/common/sqlValue";
import { supportsBindParameters, placeholder } from "@/common/sqlDialect";

export default {
  mixins: [util],
  components: { CellEditor },
  props: ["result", "dbType", "database", "table", "primaryKey", "primaryKeyList", "columnList"],
  data() {
    return {
      model: "insert",
      originModel: {},
      editModel: {},
      visible: false,
      loading: false,
    };
  },
  computed: {
    safeColumnList() {
      return Array.isArray(this.columnList) ? this.columnList : [];
    },
    editorTilte() {
      if (this.model === "insert") {
        return this.$t("Insert To") + this.table;
      }
      if (this.model === "update") {
        return (
          this.$t("Edit For") +
          this.table +
          " : " +
          this.primaryKey +
          "=" +
          this.originModel[this.primaryKey]
        );
      }
      return this.$t("Copy To") + this.table;
    },
  },
  methods: {
    createEmptyModel() {
      const model = {};
      for (const column of this.safeColumnList) {
        if (!column || !column.name) continue;
        model[column.name] = null;
      }
      return model;
    },
    openEdit(originModel) {
      if (!originModel) {
        this.$message.error("Edit row cannot be null!");
        return;
      }
      this.originModel = originModel;
      this.editModel = { ...originModel };
      this.model = "update";
      this.loading = false;
      this.visible = true;
    },
    openCopy(originModel) {
      if (!originModel) {
        this.$message.error("Edit row cannot be null!");
        return;
      }
      this.originModel = originModel;
      this.editModel = { ...originModel };
      if (this.primaryKey) {
        this.editModel[this.primaryKey] = null;
      }
      this.model = "copy";
      this.loading = false;
      this.visible = true;
    },
    openInsert() {
      if (this.result && this.result.tableCount != 1) {
        this.$message({
          type: "warning",
          message: "Not table found!",
        });
        return;
      }
      this.model = "insert";
      this.editModel = this.createEmptyModel();
      this.loading = false;
      this.visible = true;
    },
    close() {
      this.visible = false;
    },
    getTypeByColumn(key) {
      if (!this.safeColumnList.length) return;
      for (const column of this.safeColumnList) {
        if (column.name === key) {
          return column.simpleType || column.type;
        }
      }
    },
    confirmInsert() {
      if (this.dbType == "ElasticSearch") {
        this.confirmInsertEs();
        return;
      } else if (this.dbType == "MongoDB") {
        this.confirmInsertMongo();
        return;
      }
      let columns = "";
      let values = "";
      for (const key in this.editModel) {
        const type = this.getTypeByColumn(key);
        if (type == null) continue;
        const newEle = this.editModel[key];
        // An omitted column takes the table default, which is the useful behaviour
        // for INSERT. An empty text cell is still a real value ('') and is kept.
        if (newEle == null) continue;
        if (newEle === "" && !isTextType(type)) continue;
        columns += `${wrapByDb(key, this.dbType)},`;
        values += `${quoteLiteral(type, newEle, this.dbType)},`;
      }
      if (values) {
        const insertSql = `INSERT INTO ${this.table}(${columns.replace(
          /,$/,
          ""
        )}) VALUES(${values.replace(/,$/, "")})`;
        this.loading = true;
        this.$emit("execute", insertSql);
      } else {
        this.$message("Not any input, insert fail!");
      }
    },
    /**
     * Builds the UPDATE for one edited row.
     *
     * Returns {sql, values} so the extension can bind parameters on drivers that
     * support them; values is empty for the databases that cannot bind, where the
     * literals are escaped inline instead.
     */
    buildUpdateStatement(currentNew, oldRow, options) {
      if (!this.primaryKey) {
        this.$message.error("This table has not primary key, cannot update!");
        throw new Error("This table has not primary key, cannot update!");
      }
      const pkList = this.primaryKeyList || [];
      if (!pkList.length) {
        // Without this the WHERE loop below emits nothing and the UPDATE would
        // rewrite the entire table.
        this.$message.error("This table has not primary key, cannot update!");
        throw new Error("This table has not primary key, cannot update!");
      }

      const bind = !(options && options.inline) && supportsBindParameters(this.dbType);
      const values = [];
      const render = (type, value) => {
        if (bind) {
          values.push(toBindValue(type, value));
          return placeholder(this.dbType, values.length - 1);
        }
        return quoteLiteral(type, value, this.dbType);
      };

      let change = "";
      for (const key in currentNew) {
        const type = this.getTypeByColumn(key);
        if (type == null) continue;
        if (oldRow[key] !== currentNew[key]) {
          change += `${wrapByDb(key, this.dbType)}=${render(type, currentNew[key])},`;
        }
      }
      if (!change) {
        return null;
      }

      const table = wrapByDb(this.table, this.dbType);
      let sql = `UPDATE ${table} SET ${change.replace(/,$/, "")}`;
      pkList.forEach((pk, i) => {
        const pkType = pk.simpleType || pk.type;
        const keyword = i === 0 ? "WHERE" : "AND";
        sql += ` ${keyword} ${wrapByDb(pk.name, this.dbType)}=${render(pkType, oldRow[pk.name])}`;
      });
      return { sql: sql + ";", values };
    },
    /**
     * Text-only form, for the ES/Mongo paths and for callers that cannot carry bind
     * values. Delegates to buildUpdateStatement so there is a single implementation;
     * the returned SQL has literals inlined.
     */
    buildUpdateSql(currentNew, oldRow) {
      if (this.dbType == "ElasticSearch") {
        return this.confirmUpdateEs(currentNew);
      } else if (this.dbType == "MongoDB") {
        return this.confirmUpdateMongo(currentNew, oldRow);
      }
      const statement = this.buildUpdateStatement(currentNew, oldRow, { inline: true });
      return statement ? statement.sql : "";
    },
    confirmUpdate(row, oldRow) {
      if (!oldRow) {
        oldRow = this.originModel;
      }
      const currentNew = row ? row : this.editModel;

      const sql = this.buildUpdateSql(currentNew, oldRow);
      if (sql) {
        this.$emit("execute", sql);
        this.loading = true;
      } else {
        this.$message("Not any change, update fail!");
      }
    },
    confirmInsertEs() {
      this.$emit(
        "execute",
        `POST /${this.table}/_doc\n` + JSON.stringify(this.editModel)
      );
    },
    confirmInsertMongo() {
      this.$emit(
        "execute",
        `db('${this.database}').collection("${this.table}").insertOne(${JSON.stringify(this.editModel)})\n`
      );
    },
    confirmUpdateMongo(row, oldRow) {
      const temp = Object.assign({}, row);
      delete temp["_id"];
      const id = oldRow._id.indexOf("ObjectID") != -1 ? oldRow._id : `'${oldRow._id}'`;
      this.$emit(
        "execute",
        `db('${this.database}').collection("${this.table}").updateOne({_id:${id}},{ $set:${JSON.stringify(temp)}})\n`
      );
    },
    confirmUpdateEs(row) {
      let value = {};
      for (const key in row) {
        if (
          key == "_XID" ||
          key == "_index" ||
          key == "_type" ||
          key == "_score" ||
          key == "_id"
        ) {
          continue;
        }
        value[key] = row[key];
      }
      return `POST /${this.table}/_doc/${row._id}\n` + JSON.stringify(value);
    },
  },
};
</script>

<style scoped>
.edit-dialog__form {
  max-height: calc(100vh - 230px);
  overflow-y: auto;
  padding-right: 4px;
}

.edit-dialog__item {
  margin-bottom: 12px;
}

.edit-dialog__label {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  line-height: 1.4;
  color: var(--vscode-editor-foreground, inherit);
}

.edit-dialog__name {
  font-weight: 600;
}

.edit-dialog__type {
  opacity: 0.85;
}

.edit-dialog__meta {
  color: #f56c6c;
}

.edit-dialog__empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--vscode-descriptionForeground, #909399);
}

:deep(.el-dialog__body) {
  padding: 10px 20px;
}

:deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.4 !important;
  height: auto !important;
}

:deep(.el-form-item__content) {
  line-height: normal !important;
}
</style>
