<style lang="css">
</style>
<template>
  <div>
    <InfoPanel/>
    <div class="design-toolbar mb-3">
      <el-button @click="saveDesign" type="primary"
        icon="el-icon-check" size="small">
        {{ $t('Design.Update') }}
      </el-button>
      <el-button cclick="column.visible=true"  @click="addColumnInline" type="default"
        icon="el-icon-circle-plus-outline" size="small">
        {{ $t('Add Column') }}
      </el-button>
    </div>
    <ux-grid ref="uxGrid" :data="designData.editColumnList" stripe keep-source style="width: 100%" :edit-config="{trigger: 'click', mode: 'cell'}"
      :cell-style="{height: '25px'}" :row-style="rowStyle" :height="remainHeight()">
      <!-- <ux-table-column align="left" field="editState" minWidth="70" :title="$t('Design.Column.editState')"
        show-overflow-tooltip="true">
      </ux-table-column> -->
      <ux-table-column align="left" field="newColumnName" minWidth="110" :title="$t('Design.Column.Name')" edit-render
        show-overflow-tooltip="true">
        <template v-slot:edit="scope">
          <el-input v-model="scope.row.newColumnName" size="small" @change="changeColumn(scope)"></el-input>
        </template>
      </ux-table-column>
      <ux-table-column align="left" field="type" minWidth="90" :title="$t('Design.Column.Type')" edit-render
        show-overflow-tooltip="true">
        <template v-slot:edit="scope">
          <el-input v-model="scope.row.type" size="small" @change="changeColumn(scope)"></el-input>
        </template>
      </ux-table-column>
      <ux-table-column align="left" field="comment" minWidth="150" :title="$t('Design.Column.Comment')" edit-render
        show-overflow-tooltip="true">
        <template v-slot:edit="scope">
          <el-input v-model="scope.row.comment" size="small" @change="changeColumn(scope)"></el-input>
        </template>
      </ux-table-column>
      <!-- <ux-table-column align="center" field="maxLength" width="60" :title="$t('Design.Column.Length')"
        show-overflow-tooltip="true"></ux-table-column> -->
      <ux-table-column align="left" field="defaultValue" minWidth="150" :title="$t('Design.Column.Default')" edit-render
        show-overflow-tooltip="true">
        <template v-slot:edit="scope">
          <el-input v-model="scope.row.defaultValue" size="small">
            <template #suffix>
              <el-select class="w-30" style="width: 60px;" :value="$t('Design.Column.Select')" @change="changeColumn(scope, 'defaultValue', $event)">
                <el-option :label="$t('Design.Column.DefaultValue')" value=""></el-option>
                <el-option :label="$t('Design.Column.NullValue')" value="null"></el-option>
                <el-option :label="$t('Design.Column.EmptyString')" value="''"></el-option>
                <el-option label="CURRENT_TIMESTAMP" value="CURRENT_TIMESTAMP"></el-option>
              </el-select>
            </template>
          </el-input>
        </template>
      </ux-table-column>
      <ux-table-column align="center" :title="$t('Allow Null')" width="80" show-overflow-tooltip="true">
        <template v-slot="scope">
          <el-checkbox disabled1 @change="(e) => {scope.row.allowNull = e ;changeColumn(scope);}" :checked="scope.row.nullable == 'YES'"></el-checkbox>
        </template>
      </ux-table-column>
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
      <ux-table-column align="center" :title="$t('Auto Incrment')" width="60" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isAutoIncrement"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column :title="$t('Operation')" minWidth="120">
        <template v-slot="scope">
          <div style="padding: 0px 0px;">
            <el-button @click="openEdit(scope)" title="edit" size="mini" icon="el-icon-edit" circle> </el-button>
            <el-button @click="deleteConfirm(scope)" :title="$t('delete')" type="danger"
              size="mini" icon="el-icon-delete" circle> </el-button>
          </div>
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
              <el-select class="w-30" :value="$t('Design.Column.Select')" @change="editColumnDefault">
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
        <el-form-item :label="$t('Allow Null')">
          <el-checkbox v-model="column.allowNull"></el-checkbox>
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
import { Loading } from 'element-ui';
import { inject } from "../mixin/vscodeInject";
import { wrapByDb } from "@/common/wrapper";
import InfoPanel from "./InfoPanel";
export default {
  mixins: [inject],
  components:{InfoPanel},
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
      let loadingInstance = Loading.service({
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
      if (field) {
        scope.row[field] = newValue;
        // this.$set(scope.items, scope.rowIndex, scope.row)
      }
      this.$forceUpdate();
      if (scope.row.editState == 1) {
      } else {
        // if (this.$refs.uxGrid.isUpdateByRow(scope.row)) {
          scope.items[scope.rowIndex].editState = 2;
        // } else {
        //   if (scope.row.editState == 2) {
        //     scope.items[scope.rowIndex].editState = 0;
        //   }
        // }
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
        if (this.designData.editColumnList[this.editColumn.index] == 1) {
        } else {
          // 不是新增字段才将状态设置为2
          if (this.$refs.uxGrid.isUpdateByRow(this.designData.editColumnList[this.editColumn.index])) {
            this.designData.editColumnList[this.editColumn.index].editState = 2;
          }
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
      this.column.name = scope.row.name;
      this.editColumn = {
        ...scope.row,
        index: scope.rowIndex
      };
      this.column.editVisible = true;
      this.column.editLoading = false;
    },
    editColumnDefault(e) {
      this.editColumn.defaultValue = e;
      this.$forceUpdate();
    },
    deleteConfirm(scope) {
      if (this.batchMode) {
        if (scope.row.editState == 1) {
          // 新增的字段如果点击删除直接从数组删除就行
          this.$refs.uxGrid.remove(scope.row);
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