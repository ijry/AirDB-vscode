<style lang="css">
</style>
<template>
  <div>
    <InfoPanel/>
    <div class="design-toolbar mb-3">
      <el-button @click="saveDesign" type="primary" size="small">
        <el-icon><Check /></el-icon>
        {{ $t('Design.Update') }}
      </el-button>
      <el-button @click="addColumnInline" type="default" size="small">
        <el-icon><CirclePlus /></el-icon>
        {{ $t('Add Column') }}
      </el-button>
    </div>
    <vxe-table ref="uxGrid" :data="designData.editColumnList" stripe border keep-source style="width: 100%"
      :row-style="rowStyle" :height="remainHeight()">
      <vxe-column align="left" field="newColumnName" min-width="110" :title="$t('Design.Column.Name')" show-overflow>
        <template #default="scope">
          <el-input v-model="scope.row.newColumnName" size="small" @change="changeColumn(scope)"></el-input>
        </template>
      </vxe-column>
      <vxe-column align="left" field="type" min-width="90" :title="$t('Design.Column.Type')" show-overflow>
        <template #default="scope">
          <el-input v-model="scope.row.type" size="small" @change="changeColumn(scope)"></el-input>
        </template>
      </vxe-column>
      <vxe-column align="left" field="comment" min-width="150" :title="$t('Design.Column.Comment')" show-overflow>
        <template #default="scope">
          <el-input v-model="scope.row.comment" size="small" @change="changeColumn(scope)"></el-input>
        </template>
      </vxe-column>
      <vxe-column align="left" field="defaultValue" min-width="150" :title="$t('Design.Column.Default')" show-overflow>
        <template #default="scope">
          <el-input v-model="scope.row.defaultValue" size="small">
            <template #suffix>
              <el-select class="w-30" style="width: 60px;" :model-value="$t('Design.Column.Select')" @change="changeColumn(scope, 'defaultValue', $event)">
                <el-option :label="$t('Design.Column.DefaultValue')" value=""></el-option>
                <el-option :label="$t('Design.Column.NullValue')" value="null"></el-option>
                <el-option :label="$t('Design.Column.EmptyString')" value="''"></el-option>
                <el-option label="CURRENT_TIMESTAMP" value="CURRENT_TIMESTAMP"></el-option>
              </el-select>
            </template>
          </el-input>
        </template>
      </vxe-column>
      <vxe-column align="center" :title="$t('Allow Null')" width="80" show-overflow>
        <template #default="scope">
          <el-checkbox disabled1 @change="(e) => {scope.row.allowNull = e ;changeColumn(scope);}" :model-value="scope.row.nullable == 'YES'"></el-checkbox>
        </template>
      </vxe-column>
      <vxe-column align="center" width="60" :title="$t('Primary Key')" show-overflow>
        <template #default="{ row }">
          <el-checkbox disabled :model-value="row.isPrimary"></el-checkbox>
        </template>
      </vxe-column>
      <vxe-column align="center" :title="$t('Unique')" width="60" show-overflow>
        <template #default="{ row }">
          <el-checkbox disabled :model-value="row.isUnique"></el-checkbox>
        </template>
      </vxe-column>
      <vxe-column align="center" :title="$t('Auto Incrment')" width="60" show-overflow>
        <template #default="{ row }">
          <el-checkbox disabled :model-value="row.isAutoIncrement"></el-checkbox>
        </template>
      </vxe-column>
      <vxe-column :title="$t('Operation')" min-width="120">
        <template #default="scope">
          <div style="padding: 0px 0px;">
            <el-button @click="openEdit(scope)" title="edit" size="small" circle>
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button @click="deleteConfirm(scope)" :title="$t('delete')" type="danger" size="small" circle>
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </template>
      </vxe-column>
    </vxe-table>
    <el-dialog :title="$t('Update Column')" v-model="column.editVisible" top="5vh">
      <el-form :inline='false' label-width="100px" label-suffix=":" size="small">
        <!-- 字段名称 -->
        <el-form-item :label="$t('Design.Column.Name')" required>
          <el-input v-model="editColumn.name" :placeholder="$t('Design.Column.Name')"></el-input>
        </el-form-item>
        <!-- 字段类型 -->
        <el-form-item :label="$t('Design.Column.Type')" required>
          <el-input :placeholder="$t('Design.Column.Type')" v-model="editColumn.type">
            <template #suffix>
              <el-select class="w-30" :model-value="$t('Design.Column.Select')" @change="(e) => {editColumn.type = e}" filterable>
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
              <el-select class="w-30" :model-value="$t('Design.Column.Select')" @change="editColumnDefault">
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
        <el-form-item :label="$t('Allow Null')">
          <el-checkbox v-model="editColumn.allowNull"></el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
        <el-button type="primary" size="default" :loading="column.editLoading" @click="updateColumn">
            {{ $t('Design.Update') }}
        </el-button>
        <el-button  size="default" @click="column.editVisible=false">
          {{ $t('Cancel') }}
        </el-button>
        </span>
      </template>
    </el-dialog>
    <el-dialog :title="$t('Add Column')" v-model="column.visible" top="5vh">
      <el-form :inline='false' label-width="100px" label-suffix=":" size="small">
        <el-form-item :label="$t('Design.Column.Name')" :placeholder="$t('Design.Column.Name')" required>
          <el-input v-model="column.name" :placeholder="$t('Design.Column.Name')"></el-input>
        </el-form-item>
        <el-form-item :label="$t('Design.Column.Type')" required>
          <el-input :placeholder="$t('Design.Column.Type')" v-model="column.type">
            <template #suffix>
              <el-select class="w-30" :model-value="$t('Design.Column.Select')" @change="(e) => {column.type = e}" filterable>
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
              <el-select class="w-30" :model-value="$t('Design.Column.Select')" @change="(e) => {column.defaultValue = e}">
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
            v-model="column.comment"></el-input>
        </el-form-item>
        <el-form-item :label="$t('Allow Null')">
          <el-checkbox v-model="column.allowNull"></el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
        <el-button size="default" type="primary" :loading="column.loading" @click="createcolumn">
          {{ $t('Design.Create') }}
        </el-button>
        <el-button size="default" @click="column.visible=false">
          {{ $t('Cancel') }}
        </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ElLoading } from 'element-plus';
import { Check, CirclePlus, Delete, Edit } from '@element-plus/icons-vue';
import { inject } from "../mixin/vscodeInject";
import { wrapByDb } from "@/common/wrapper";
import InfoPanel from "./InfoPanel";
export default {
  mixins: [inject],
  components:{InfoPanel, Check, CirclePlus, Delete, Edit},
  data() {
    return {
      batchMode: true,
      editLoading: false,
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
        editState: 0, // 0不变1新增-1删除2修改
        visible: false,
        editVisible: false,
        loading: false,
        editLoading: false,
        name: '',
        newColumnName: '',
        type: null,
        defaultValue: '',
        comment: '',
        allowNull: true,
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
    saveDesign() {
      let loadingInstance = ElLoading.service({
        text: 'saveing...'
      });
      // 保存表结构设计
      let changeList = [];
      this.designData.editColumnList.forEach(ele => {
        if (ele.defaultValue == undefined) {
          ele.defaultValue = '';
        }
        switch (ele.editState) {
          case 1:
            changeList.push({
              actionType: 'addColumnSql',
              columnType: ele.type,
              comment: ele.comment,
              nullable: ele.allowNull,
              defaultValue: ele.defaultValue,
              table: this.designData.table,
              columnName: ele.newColumnName,
            });
            break;
          case 2:
            changeList.push({
              actionType: 'updateColumnSql',
              newColumnName: ele.newColumnName,
              columnType: ele.type,
              comment: ele.comment,
              nullable: ele.allowNull,
              defaultValue: ele.defaultValue,
              table: this.designData.table,
              columnName: ele.name,
            });
            break;
          case -1:
            changeList.push({
              actionType: 'execute',
              sql: `ALTER TABLE ${wrapByDb(
                this.designData.table,
                this.designData.dbType
              )} DROP COLUMN ${ele.name};`
            })
          default:
            break;
        }
      })
      if (changeList.length == 0) {
        loadingInstance.close();
        this.$message.error(this.$t("No Change")+ "!");
        return;
      }
      this.emit("saveDesign", changeList);
      loadingInstance.close();
    },
    changeColumn(scope, field = '', newValue = '') {
      console.log(scope)
      const rowIndex = scope.rowIndex != null ? scope.rowIndex : scope.$rowIndex;
      if (field) {
        scope.row[field] = newValue;
      }
      this.$forceUpdate();
      if (scope.row.editState == 1) {
      } else if (rowIndex != null && this.designData.editColumnList[rowIndex]) {
        this.designData.editColumnList[rowIndex].editState = 2;
      }
    },
    rowStyle({row}) {
      let style = {};
      switch (row.editState) {
        case -1:
          style['background-color'] = '#e74c3c !important';
          break;
        case 1:
          style['background-color'] = '#27ae60 !important';
          break;
        case 2:
          style['background-color'] = '#e67e22 !important';
          break;
      
        default:
          break;
      }
      return style;
    },
    remainHeight() {
      return window.outerHeight - 280;
    },
    addColumnInline() {
      let len = this.designData.editColumnList.length;
      this.designData.editColumnList = [...this.designData.editColumnList, {
          "name": "field" + (len + 1),
          "newColumnName": "field" + (len + 1),
          "simpleType": "varchar",
          "type": "varchar(255)",
          "comment": "",
          "key": "",
          "nullable": "YES",
          "extra": "",
          "allowNull": true,
          "editState": 1
      }];
      this.$forceUpdate();
      console.log(this.designData.editColumnList)
    },
    updateColumn() {
      if (this.batchMode) {
        this.designData.editColumnList[this.editColumn.index].newColumnName = this.editColumn.name;
        this.designData.editColumnList[this.editColumn.index].type = this.editColumn.type;
        this.designData.editColumnList[this.editColumn.index].comment = this.editColumn.comment;
        this.designData.editColumnList[this.editColumn.index].allowNull = this.editColumn.allowNull;
        this.designData.editColumnList[this.editColumn.index].defaultValue = this.editColumn.defaultValue;
        const targetColumn = this.designData.editColumnList[this.editColumn.index];
        if (targetColumn && targetColumn.editState !== 1) {
          targetColumn.editState = 2;
        }
        this.column.editVisible = false;
      } else {
        this.emit("updateColumnSql", {
          newColumnName: this.editColumn.name,
          columnType: this.editColumn.type,
          comment: this.editColumn.comment,
          nullable: this.editColumn.allowNull,
          defaultValue: this.editColumn.defaultValue,
          table: this.designData.table,
          columnName: this.column.name,
        });
      }
    },
    createcolumn() {
      this.column.loading = true;
      this.emit("addColumnSql", {
        columnType: this.column.type,
        comment: this.column.comment,
        nullable: this.column.allowNull,
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
    openEdit(scope) {
      const rowIndex = scope.rowIndex != null ? scope.rowIndex : scope.$rowIndex;
      this.column.name = scope.row.name;
      this.editColumn = {
        ...scope.row,
        index: rowIndex
      };
      this.column.editVisible = true;
      this.column.editLoading = false;
    },
    editColumnDefault(e) {
      this.editColumn.defaultValue = e;
      this.$forceUpdate();
    },
    deleteConfirm(scope) {
      const rowIndex = scope.rowIndex != null ? scope.rowIndex : scope.$rowIndex;
      if (this.batchMode) {
        if (scope.row.editState == 1) {
          this.designData.editColumnList.splice(rowIndex, 1);
        } else {
          // 其它状态置为删除状态等待保存变更
          scope.row.editState = -1
        }
      } else {
        this.$confirm(this.$t("Are you sure you want to delete this column?"), this.$t("Warning"), {
          confirmButtonText: this.$t("OK"),
          cancelButtonText: this.$t("Cancel"),
          type: "warning",
        }).then(() => {
          this.execute(
            `ALTER TABLE ${wrapByDb(
              this.designData.table,
              this.designData.dbType
            )} DROP COLUMN ${scope.row.name}`
          );
        });
      }
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
