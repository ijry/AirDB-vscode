<style>
.el-textarea__inner {
  line-height: 1.1;
  padding-bottom: 18px;
}
.edit-column {
  padding: 0px 3px !important;
  line-height: 25px !important;
}
.plx-body--column .edit-filter input {
  height: 25px !important;
  line-height: 25px !important;
}
.el-popover__reference {
  border: var(--border-color) !important;
  background-color: var(--vscode-editor-background) !important;
}
</style>
<template>
  <div id="app" style="padding: 0px 10px;">
    <div ref="hint" class="hint px-0" style="margin-bottom: 3px;padding-left: 0;padding-right: 0;">
      <div class="relative" style="width:100%;margin-top: 0px;margin-bottom: 6px;position: relative;">
        <el-input class="sql-pannel" type="textarea" :autosize="{ minRows:2, maxRows:8}"
          v-model="toolbar.sql" @keypress.native="panelInput" />
          <div style="position: absolute;bottom: 5px;right: 10px;">
          </div>
      </div>
      <div class="toolbar-session" style="display: flex;align-items: center;"">
        <div class="excute-box" style="display:flex;align-items: center;padding-right: 15px;">
          <div style="display:inline-flex;align-items: center;font-size:14px;padding-left: 0px;" class="el-pagination__total">
            <span class="cursor-pointer" style="padding: 0px 5px 0px 0px; cursor: pointer;" v-if="info.message" @click="openResult">
              <span v-if="!info.error" style="display:inline-flex;align-items: center;">
                <svg t="1730897237521" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4311" width="17" height="17"><path d="M512 97.52381c228.912762 0 414.47619 185.563429 414.47619 414.47619s-185.563429 414.47619-414.47619 414.47619S97.52381 740.912762 97.52381 512 283.087238 97.52381 512 97.52381z m193.194667 218.331428L447.21981 581.315048l-103.936-107.812572-52.662858 50.761143 156.379429 162.230857 310.662095-319.683047-52.467809-50.956191z" p-id="4312" fill="#15d422"></path></svg>
                Success
              </span>
              <span v-if="info.error" style="display:inline-flex;align-items: center;">
                <svg t="1730897350201" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8866" width="17" height="17"><path d="M509.994667 85.333333C275.84 85.333333 85.333333 276.736 85.333333 512s191.402667 426.666667 426.666667 426.666667 426.666667-191.402667 426.666667-426.666667S746.368 85.333333 509.994667 85.333333zM554.666667 725.333333h-85.333334v-85.333333h85.333334v85.333333z m0-170.666666h-85.333334V298.666667h85.333334v256z" p-id="8867" fill="#d81e06"></path></svg>
                Error
              </span>
            </span>
            <span>{{ $t('Cost') }}: {{result.costTime}}ms</span>
          </div>
          <el-button v-if="hasChanged" size="small" :title="$t('Save')" @click="save" type="warning">
            {{ $t('Save') }}{{ $t('Changes') }}
          </el-button>
          <el-button size="small" :title="$t('Execute Sql')" @click="result.data=[];info.message = false;execute(toolbar.sql);">
            {{ $t('Execute Sql') }}
          </el-button>
        </div>
        <Toolbar style="flex: 1;" :showFullBtn="showFullBtn" :search.sync="table.search"
          :costTime="result.costTime" :showOpenDesignBtn="result.showOpenDesignBtn"
          @sendToVscode="sendToVscode" @export="exportOption.visible = true"
          @insert="$refs.editor.openInsert()" @deleteConfirm="deleteConfirm"
          @run="info.message = false;execute(toolbar.sql);" />
      </div>
      <el-dialog :title="$t('Result')" :visible.sync="resultDialog" top="5vh" size="default" @close="closeResult">
        <div v-if="info.message ">
          <div class="info-panel" style="color:red !important;line-height: 1.4;"
            :style="{color: info.error ? 'red !important' : 'green !important'}">
            <div v-html="info.message"></div>
            <div style="margin-top: 10px;">SQL: {{ info.sql }}</div>
          </div>
        </div>
      </el-dialog>
    </div>
    <!-- trigger when click -->
    <ux-grid ref="dataTable" :data="filterData" v-loading='table.loading'
      size='small' :cell-style="{height: '24px', 'overflow': 'hidden'}" @sort-change="sort" :height="remainHeight"
      width="100vw" stripe :checkboxConfig="{ checkMethod: selectable}">
      <ux-table-column type="checkbox" width="40" fixed="left" align="center"></ux-table-column>
      <ux-table-column type="index" width="40"  align="center" :seq-method="({row,rowIndex})=>(rowIndex||!row.isFilter)?rowIndex:undefined">
        <Controller slot="header" :result="result" :toolbar="toolbar" />
      </ux-table-column>
      <ux-table-column v-for="(field,index) in (result.fields||[]).filter(field=>toolbar.showColumns.includes(field.name.toLowerCase()))"
        :key="index" :resizable="true" :field="field.name" :title="field.name" :sortable="true" :minWidth="computeWidth(field,0)" edit-render>
        <Header slot="header" slot-scope="scope" :result="result" :scope="scope" :index="index" />
        <Row slot-scope="scope" :scope="scope" :result="result" :filterObj="toolbar.filter" @execute="execute"
          :editList.sync="update.editList" @sendToVscode="sendToVscode" @openEditor="openEditor" />
      </ux-table-column>
    </ux-grid>
    <div style="margin-top: 2px;display: flex;background: var(--vscode-editor-background);border-top: 1px solid var(--vscode-textBlockQuote-background);padding: 0px;">
      <Pagination :page="page"  @changePage="changePage"></Pagination>
    </div>
    <EditDialog ref="editor" :dbType="result.dbType" :result="result"
      :database="result.database" :table="result.table" :primaryKey="result.primaryKey"
      :primaryKeyList="result.primaryKeyList" :columnList="result.columnList" @execute="execute" />
    <ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import Row from "./component/Row";
import Controller from "./component/Row/Controller.vue";
import Header from "./component/Row/Header.vue";
import ExportDialog from "./component/ExportDialog.vue";
import Toolbar from "./component/Toolbar";
import Pagination from "./component/Pagination";
import EditDialog from "./component/EditDialog";
import { util } from "./mixin/util";
import { wrapByDb } from "@/common/wrapper";
let vscodeEvent;

export default {
  mixins: [util],
  components: {
    ExportDialog,
    EditDialog,
    Toolbar,
    Pagination,
    Controller,
    Row,
    Header,
  },
  data() {
    return {
      hinHeight: 90,
      showFullBtn: false,
      remainHeight: 0,
      connection: {},
      resultDialog: false,
      result: {
        data: [],
        dbType: "",
        costTime: 0,
        sql: "",
        primaryKey: null,
        columnList: null,
        primaryKeyList: null,
        database: null,
        table: null,
        tableCount: null,
      },
      page: {
        pageNum: 1,
        pageSize: -1,
        total: null,
      },
      table: {
        search: "",
        loading: true,
        widthItem: {},
      },
      toolbar: {
        sql: null,
        // using to clear filter input value
        filter: {},
        showColumns: [],
      },
      exportOption: {
        visible: false,
      },
      info: {
        sql: null,
        message: null,
        error: false,
        needRefresh: true,
      },
      update: {
        editList: {},
        lock: false,
      },
      // hasChanged: false,
      // 代替叫变更
      // { rowIndex: 12, type: 'add', row: {...}} // 新增行
      // { rowIndex: 1, type: 'delete', row: {...}} // 删除行
      // { rowIndex: 2, type: 'edit', row: {...}} // 修改
      waitCommitChange: [
      ]
    };
  },
  mounted() {
    this.observeWithResizeObserver();
    this.remainHeight = window.innerHeight - this.hinHeight;
    this.showFullBtn = window.outerWidth / window.innerWidth >= 2;
    window.addEventListener("resize", () => {
      this.remainHeight = window.innerHeight - this.hinHeight;
      this.showFullBtn = window.outerWidth / window.innerWidth >= 2;
    });
    const handlerData = (data, sameTable) => {
      this.result = data;
      this.toolbar.sql = data.sql;

      if (sameTable) {
        this.clear();
      } else {
        this.reset();
      }
      // only es have.
      if (data.total != null) {
        this.page.total = parseInt(data.total);
      } else if (
        this.result.tableCount == 1 &&
        this.page.pageSize < this.result.data.length + 1
      ) {
        this.count();
      } else {
        this.page.total = this.result.data.length - 1;
      }
      this.update.editList = [];
      this.update.lock = false;
    };
    const handlerCommon = (res) => {
      if (this.$refs.editor) {
        this.$refs.editor.close();
      }
      this.info.message = res.message;
      this.info.sql = res.sql;
    };
    vscodeEvent = getVscodeEvent();

    // 监听状态同步
    vscodeEvent.on("syncState", (state) => {
      console.log('syncState', state)
      let locale = 'en'
      if (state.lang == 'zh-cn' || state.lang == 'zh-tw') {
        locale = 'zh'
      } else {
        locale = state.lang
      }
      this.$i18n.locale = locale
      console.log(this.$i18n)
    }).on("updateSuccess", () => {
      for (const index in this.update.editList) {
        const element = this.update.editList[index];
        this.result.data[index] = element;
      }
      this.update.editList = {};
      this.update.lock = false;
      this.$message({
        showClose: true,
        duration: 500,
        message: this.$t("Update Success"),
        type: "success",
      });
    });
    // window.onkeypress = (e) => {
    //   if (
    //     (e.code == "Enter" && e.target.classList.contains("edit-column")) ||
    //     (e.ctrlKey && e.code == "KeyS")
    //   ) {
    //     this.save();
    //     e.stopPropagation();
    //     e.preventDefault();
    //   }
    // };
    window.addEventListener("message", ({ data }) => {
      if (!data) return;
      const response = data.content;
      console.log(data);
      this.result.transId=response.transId;
      this.table.loading = false;
      switch (data.type) {
        case "EXPORT_DONE":
          this.exportOption.visible = false;
          break;
        case "RUN":
          this.toolbar.sql = response.sql;
          this.table.loading = response.transId != this.result.transId;
          break;
        case "DATA":
          handlerData(response);
          break;
        case "NEXT_PAGE":
          this.result.data = response.data;
          this.result.costTime=response.costTime;
          this.toolbar.sql = response.sql;
          this.result.data.unshift({ isFilter: true, content: "" });
          break;
        case "COUNT":
          this.page.total = parseInt(response.data);
          break;
        case "DML":
        case "DDL":
        case "MESSAGE_BLOCK":
          handlerCommon(response);
          this.info.error = false;
          this.info.needRefresh = false;
          if (
            response.message.indexOf("AffectedRows") != -1 ||
            response.isInsert
          ) {
            this.refresh();
          }
          break;
        case "ERROR":
          handlerCommon(response);
          this.info.error = true;
          break;
        case "MESSAGE":
          if (response.message) {
            this.$message({
              showClose: true,
              duration: 1000,
              message: response.message,
              type: response.success ? "success" : "error",
            });
          }
          this.refresh();
          break;
      }
    });
    vscodeEvent.emit("init");
    window.addEventListener("keyup", (event) => {
      if (event.key == "c" && event.ctrlKey) {
        document.execCommand("copy");
      }
    });
  },
  methods: {
    closeResult() {
      this.resultDialog = false;
      this.$forceUpdate();
    },
    openResult() {
      this.resultDialog = true;
      this.$forceUpdate();
    },
    resetChange() {
      this.update = {
        editList: {},
        lock: false,
      }
      // this.hasChanged = false;
    },
    changePageSize(size) {
      if (Object.keys(this.update.editList).length > 0) {
        this.$confirm(this.$t('This action will lost changed data!'), this.$t("Warning"), {
        confirmButtonText: this.$t('OK'),
        cancelButtonText: this.$t('Cancel'),
        type: "warning",
      })
        .then(() => {
          this.resetChange();
          this.page.pageSize = size;
          vscodeEvent.emit("changePageSize", size);
          this.changePage(0);
        })
        .catch((e) => {
        });
      } else {
        this.page.pageSize = size;
        vscodeEvent.emit("changePageSize", size);
        this.changePage(0);
      }
    },
    observeWithResizeObserver() {
      const element = this.$refs.hint;
      const observer = new ResizeObserver(entries => {
        entries.forEach(entry => {
          console.log('Height changed:', entry.contentRect.height);
          this.hinHeight = entry.contentRect.height + 43;
          this.remainHeight = window.innerHeight - this.hinHeight;
          this.showFullBtn = window.outerWidth / window.innerWidth >= 2;
        });
      });

      observer.observe(element);

      // 销毁时移除监听
      this.$once('hook:beforeDestroy', () => {
        observer.disconnect();
      });
    },
    panelInput(event){
      if(event.code=='Enter' && event.ctrlKey){
        this.execute(this.toolbar.sql)
        event.stopPropagation()
      }
    },
    selectable({row}) {
      return this.editable && !row.isFilter;
    },
    save() {
      if (Object.keys(this.update.editList).length == 0 && this.update.lock) {
        return;
      }
      this.update.lock = true;
      let sql = "";
      for (const index in this.update.editList) {
        const element = this.update.editList[index];
        sql += this.$refs.editor.buildUpdateSql(
          element,
          this.result.data[index]
        );
      }
      if (sql) {
        vscodeEvent.emit("saveModify", sql);
      }
    },
    sendToVscode(event, param) {
      if (event == 'dataModify') {
        // 有数据变动标记
        if (Object.keys(this.update.editList).length > 0) {
          // this.hasChanged = true;
        }
      }
      vscodeEvent.emit(event, param);
    },
    openEditor(row, isCopy) {
      if (Object.keys(this.update.editList).length > 0) {
        this.$confirm(this.$t('This action will lost changed data!'), this.$t("Warning"), {
          confirmButtonText: this.$t('OK'),
          cancelButtonText: this.$t('Cancel'),
          type: "warning",
        })
          .then(() => {
            this.resetChange();
            if (isCopy) {
              this.$refs.editor.openCopy(row);
            } else {
              this.$refs.editor.openEdit(row);
            }
          })
          .catch((e) => {
          });
      } else {
        if (isCopy) {
            this.$refs.editor.openCopy(row);
          } else {
            this.$refs.editor.openEdit(row);
          }
      }
    },
    confirmExport(exportOption) {
      vscodeEvent.emit("export", {
        option: {
          ...exportOption,
          sql: this.result.sql,
          table: this.result.table,
        },
      });
    },
    sort(row) {
      if (this.result.dbType == "ElasticSearch") {
        vscodeEvent.emit("esSort", [{ [row.prop]: { order: row.order } }]);
        return;
      }
      let sortSql = this.result.sql
        .replace(/\n/, " ")
        .replace(";", "")
        .replace(/order by .+? (desc|asc)?/gi, "")
        .replace(/\s?(limit.+)?$/i, ` ORDER BY ${row.prop} ${row.order} \$1 `);
      this.execute(sortSql + ";");
    },
    getTypeByColumn(key) {
      if (!this.result.columnList) return;
      for (const column of this.result.columnList) {
        if (column.name === key) {
          return column.simpleType || column.type;
        }
      }
    },
    deleteConfirm() {
      const datas = this.$refs.dataTable.getCheckboxRecords();
      if (!datas || datas.length == 0) {
        this.$message({
          type: "warning",
          message: this.$t('You need to select at least one row of data.')
        });
        return;
      }
      this.$confirm(this.$t('Are you sure you want to delete this data?'), this.$t("Warning"), {
        confirmButtonText: this.$t('OK'),
        cancelButtonText: this.$t('Cancel'),
        type: "warning",
      })
        .then(() => {
          let checkboxRecords = datas
            .filter(
              (checkboxRecord) => checkboxRecord[this.result.primaryKey] != null
            )
            .map((checkboxRecord) =>
              this.wrapQuote(
                this.getTypeByColumn(this.result.primaryKey),
                checkboxRecord[this.result.primaryKey]
              )
            );
          let deleteSql = null;
          if (this.result.dbType == "ElasticSearch") {
            deleteSql =
              checkboxRecords.length > 1
                ? `POST /_bulk\n${checkboxRecords
                    .map(
                      (c) =>
                        `{ "delete" : { "_index" : "${this.result.table}", "_id" : "${c}" } }`
                    )
                    .join("\n")}`
                : `DELETE /${this.result.table}/_doc/${checkboxRecords[0]}`;
          } else if (this.result.dbType == "MongoDB") {
            deleteSql = `db('${this.result.database}').collection("${
              this.result.table
            }")
              .deleteMany({_id:{$in:[${checkboxRecords.join(",")}]}})`;
          } else {
            const table=wrapByDb(this.result.table,this.result.dbType);
            deleteSql =
              checkboxRecords.length > 1
                ? `DELETE FROM ${table} WHERE ${this.result.primaryKey} in (${checkboxRecords.join(",")})`
                : `DELETE FROM ${table} WHERE ${this.result.primaryKey}=${checkboxRecords[0]}`;
          }
          this.execute(deleteSql);
        })
        .catch((e) => {
          if (e) {
            this.$message.error(e);
          } else {
            this.$message({ type: "warning", message: this.$t("Delete canceled") });
          }
        });
    },
    /**
     * compute column row width, get maxium of fieldName or value or fieldType by top 10 row.
     */
    computeWidth(field, index) {
      // only compute once.
      let key = field.name;
      if (this.table.widthItem[key]) return this.table.widthItem[key];
      if (!index) index = 0;
      if (!this.result.data[index] || index > 10) return 70;
      const value = this.result.data[index][key];
      var dynamic = Math.max(
        (key + "").length * 10,
        (value + "").length * 10,
        (field.type + "").length * 10
      );
      if (dynamic > 150) dynamic = 150;
      if (dynamic < 70) dynamic = 70;
      var nextDynamic = this.computeWidth(field, index + 1);
      if (dynamic < nextDynamic) dynamic = nextDynamic;
      // cache column width
      this.table.widthItem[key] = dynamic;
      return dynamic;
    },
    refresh() {
      if (this.result.sql) {
        this.execute(this.result.sql);
      }
    },
    count() {
      if (!this.result.table) return;
      this.info.message = null;
      vscodeEvent.emit("count", { sql: this.result.sql });
    },
    execute(sql) {
      if (!sql) return;
      vscodeEvent.emit("execute", {
        sql,
      });
      this.table.loading = true;
    },
    changePage(pageNum, jump) {
      if (Object.keys(this.update.editList).length > 0) {
        this.$confirm(this.$t('This action will lost changed data!'), this.$t("Warning"), {
        confirmButtonText: this.$t('OK'),
        cancelButtonText: this.$t('Cancel'),
        type: "warning",
      })
        .then(() => {
          this.resetChange();
          vscodeEvent.emit("next", {
            sql: this.result.sql,
            pageNum: jump ? pageNum : this.page.pageNum + pageNum,
            pageSize: this.page.pageSize,
          });
          this.table.loading = true;
        })
        .catch((e) => {
        });
      } else {
        vscodeEvent.emit("next", {
            sql: this.result.sql,
            pageNum: jump ? pageNum : this.page.pageNum + pageNum,
            pageSize: this.page.pageSize,
          });
          this.table.loading = true;
      }
    },
    initShowColumn() {
      const fields = this.result.fields;
      if (!fields) return;
      this.toolbar.showColumns = [];
      for (let i = 0; i < fields.length; i++) {
        if (!fields[i].name) continue;
        this.toolbar.showColumns.push(fields[i].name.toLowerCase());
      }
    },
    // show call when load same table data
    clear() {
      // reset page
      this.page.pageNum = 1;
      this.page.pageSize = this.result.pageSize;
      this.page.total = null;
      // info
      if (this.info.needRefresh) {
        this.info.message = null;
      } else {
        this.info.needRefresh = true;
      }
      // loading
      this.table.loading = false;
    },
    // show call when change table
    reset() {
      this.clear();
      // table
      this.table.widthItem = {};
      this.initShowColumn();
      // add filter row
      if (this.result.columnList) {
        this.result.data.unshift({ isFilter: true, content: "" });
      }
      // toolbar
      if (!this.result.sql.match(/\bwhere\b/gi)) {
        this.toolbar.filter = {};
        this.$refs.dataTable.clearSort();
      }
    },
  },
  computed: {
    hasChanged() {
      return Object.keys(this.update.editList).length > 0;
    },
    filterData() {
      return this.result.data.filter(
        (data) =>
          !this.table.search ||
          JSON.stringify(data)
            .toLowerCase()
            .includes(this.table.search.toLowerCase())
      );
    },
    editable() {
      return this.result.primaryKey && this.result.tableCount == 1;
    },
    columnCount() {
      if (this.result.data == undefined || this.result.data[0] == undefined)
        return 0;
      return Object.keys(this.result.data[0]).length;
    },
  },
};
</script>