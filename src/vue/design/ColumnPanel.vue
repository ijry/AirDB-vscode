<template>
  <div>
    <InfoPanel/>
    <div class="design-toolbar mb-3">
      <el-button @click="column.visible=true" type="default" :title="$t('Design.Insert')"
        icon="el-icon-circle-plus-outline" size="small">
        {{ $t('Add Column') }}
      </el-button>
    </div>
    <ux-grid :data="designData.editColumnList" stripe style="width: 100%"
      :cell-style="{height: '25px'}" :height="remainHeight()">
      <ux-table-column align="center" field="name" minWidth="130" :title="$t('Design.Column.Name')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="type" width="110" :title="$t('Design.Column.Type')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="comment" minWidth="150"  :title="$t('Design.Column.Comment')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="maxLength" width="60" :title="$t('Design.Column.Length')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="defaultValue" width="120" :title="$t('Design.Column.Default')"
        show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" width="60" :title="$t('Primary Key')"
        show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isPrimary"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column align="center" :title="$t('Unique')" width="60" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isUnique"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column align="center" :title="$t('Not Null')" width="60" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.nullable=='NO'"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column align="center" :title="$t('Auto Incrment')" width="60" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isAutoIncrement"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column :title="$t('Operation')" width="120">
        <template v-slot="{ row }">
          <el-button @click="openEdit(row)" title="edit" size="mini" icon="el-icon-edit" circle> </el-button>
          <el-button @click="deleteConfirm(row)" :title="$t('delete')" type="danger"
            size="mini" icon="el-icon-delete" circle> </el-button>
        </template>
      </ux-table-column>
    </ux-grid>
    <el-dialog :title="$t('Update Column')" :visible.sync="column.editVisible" top="5vh" size="default">
      <el-form :inline='false' label-width="100px" label-suffix=":" size="small">
        <!-- 字段名称 -->
        <el-form-item :label="$t('Design.Column.Name')" required>
          <el-input v-model="editColumn.name" :placeholder="$t('Design.Column.Name')"></el-input>
        </el-form-item>
        <!-- 字段类型 -->
        <el-form-item :label="$t('Design.Column.Type')" required>
          <el-input :placeholder="$t('Design.Column.Type')" v-model="editColumn.type">
            <template #suffix>
              <el-select class="w-30" :value="$t('Design.Column.Select')" @change="(e) => {editColumn.type = e}" filterable>
                <template v-for="item in typeList">
                  <el-option  v-if="!item.onlyType || (item.onlyType && item.onlyType.includes(designData.dbType))"
                    :label="item.label" :value="item.label"></el-option>
                </template>
              </el-select>
            </template>
          </el-input>
        </el-form-item>
        <!-- 默认值 -->
        <el-form-item :label="$t('Design.Column.Default')">
          <el-input :placeholder="$t('Design.Column.Default')"
            v-model="editColumn.defaultValue">
            <template #suffix>
              <el-select class="w-30" :value="$t('Design.Column.Select')" @change="(e) => {editColumn.defaultValue = e}">
                <el-option :label="$t('Design.Column.DefaultValue')" value=""></el-option>
                <el-option :label="$t('Design.Column.NullValue')" value="null"></el-option>
                <el-option :label="$t('Design.Column.EmptyString')" value="''"></el-option>
                <el-option label="CURRENT_TIMESTAMP" value="CURRENT_TIMESTAMP"></el-option>
              </el-select>
            </template>
          </el-input>
        </el-form-item>
        <!-- 字符集 -->
        <!-- 字符排序规则 -->
        <!-- 备注 -->
        <el-form-item :label="$t('Design.Column.Comment')">
          <el-input type="textarea" :placeholder="$t('Design.Column.Comment')"
            v-model="editColumn.comment"></el-input>
        </el-form-item>
        <!-- 允许Null -->
        <el-form-item label="Not Null">
          <el-checkbox v-model="editColumn.isNotNull"></el-checkbox>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button type="primary" size="medium" :loading="column.editloading" @click="updateColumn">
            {{ $t('Design.Update') }}
        </el-button>
        <el-button  size="medium" @click="column.editVisible=false">
          {{ $t('Cancel') }}
        </el-button>
      </span>
    </el-dialog>
    <el-dialog :title="$t('Add Column')" :visible.sync="column.visible" top="5vh" size="default">
      <el-form :inline='false' label-width="100px" label-suffix=":" size="small">
        <el-form-item :label="$t('Design.Column.Name')" :placeholder="$t('Design.Column.Name')" required>
          <el-input v-model="column.name" :placeholder="$t('Design.Column.Name')"></el-input>
        </el-form-item>
        <el-form-item :label="$t('Design.Column.Type')" required>
          <el-input :placeholder="$t('Design.Column.Type')" v-model="column.type">
            <template #suffix>
              <el-select class="w-30" :value="$t('Design.Column.Select')" @change="(e) => {column.type = e}" filterable>
                <template v-for="item in typeList">
                  <el-option  v-if="!item.onlyType || (item.onlyType && item.onlyType.includes(designData.dbType))"
                    :label="item.label" :value="item.label"></el-option>
                </template>
              </el-select>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('Design.Column.Default')">
          <el-input :placeholder="$t('Design.Column.Default')"
            v-model="column.defaultValue">
            <template #suffix>
              <el-select class="w-30" :value="$t('Design.Column.Select')" @change="(e) => {column.defaultValue = e}">
                <el-option :label="$t('Design.Column.DefaultValue')" value=""></el-option>
                <el-option :label="$t('Design.Column.NullValue')" value="null"></el-option>
                <el-option :label="$t('Design.Column.EmptyString')" value="''"></el-option>
                <el-option label="CURRENT_TIMESTAMP" value="CURRENT_TIMESTAMP"></el-option>
              </el-select>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('Design.Column.Comment')">
          <el-input type="textarea"  :placeholder="$t('Design.Column.Comment')"
            v-model="editColumn.comment"></el-input>
        </el-form-item>
        <el-form-item label="Not Null">
          <el-checkbox v-model="column.isNotNull"></el-checkbox>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button size="medium" type="primary" :loading="column.loading" @click="createcolumn">
          {{ $t('Design.Create') }}
        </el-button>
        <el-button size="medium" @click="column.visible=false">
          {{ $t('Cancel') }}
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { inject } from "../mixin/vscodeInject";
import { wrapByDb } from "@/common/wrapper";
import InfoPanel from "./InfoPanel";
export default {
  mixins: [inject],
  components:{InfoPanel},
  data() {
    return {
      typeList: [
        {label: 'tinyint(1)', label: 'smallint(3)', onlyType: ['MySQL']},{label: 'int(11)'},{label: 'bigint(20)'},
        {label: 'char(20)'},{label: 'varchar(64)'},{label: 'varchar(256)'},
        {label: 'date'},{label: 'datetime'},{label: 'timestamp', onlyType: ['MySQL']},
        {label: 'text'},{label: 'longtext'},
        {label: 'float'},
        {label: 'double', onlyType: ['MySQL', 'PostgreSQL']},
        {label: 'decimal(11,2)'},
        {label: 'boolean', onlyType: ['PostgreSQL']},
      ],
      designData: {
        table: null,
        dbType: null,
        columnList: [],
        editColumnList: [],
      },
      editColumn: {},
      column: {
        visible: false,
        editVisible: false,
        loading: false,
        editLoading: false,
        name: '',
        type: null,
        defaultValue: '',
        isNotNull: false,
        nullable: false,
      },
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.designData = data;
      this.designData.editColumnList = [...this.designData.columnList];
    })
      .on("success", () => {
        this.column.loading = false;
        this.column.editLoading = false;
        this.column.visible = false;
        this.column.editVisible = false;
        this.init();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      })
      .init();
  },
  methods: {
    remainHeight() {
      return window.outerHeight - 280;
    },
    updateColumn() {
      this.emit("updateColumnSql", {
        newColumnName: this.editColumn.name,
        columnType: this.editColumn.type,
        comment: this.editColumn.comment,
        nullable: !this.editColumn.isNotNull,
        defaultValue: this.editColumn.defaultValue,
        table: this.designData.table,
        columnName: this.column.name,
      });
    },
    createcolumn() {
      this.column.loading = true;
      this.emit("addColumnSql", {
        columnType: this.column.type,
        comment: this.column.comment,
        nullable: !this.column.isNotNull,
        defaultValue: this.column.defaultValue,
        table: this.designData.table,
        columnName: this.column.name,
      });
      // this.execute(
      //   `ALTER TABLE ${wrapByDb(
      //     this.designData.table,
      //     this.designData.dbType
      //   )} ADD ${wrapByDb(this.column.name, this.designData.dbType)} ${
      //     this.column.type
      //   }`
      // );
    },
    openEdit(row) {
      this.column.name = row.name;
      this.editColumn = {...row};
      this.column.editVisible = true;
      this.column.editLoading = false;
    },
    deleteConfirm(row) {
      this.$confirm(this.$t("Are you sure you want to delete this column?"), this.$t("Warning"), {
        confirmButtonText: this.$t("OK"),
        cancelButtonText: this.$t("Cancel"),
        type: "warning",
      }).then(() => {
        this.execute(
          `ALTER TABLE ${wrapByDb(
            this.designData.table,
            this.designData.dbType
          )} DROP COLUMN ${row.name}`
        );
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