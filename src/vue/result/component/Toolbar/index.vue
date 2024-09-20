<template>
  <div class="toolbar" style="display: flex;justify-content: space-between;align-items: center;">
    <div class="left" style="flex: 1;">
       <el-button v-if="showFullBtn" @click="()=>$emit('sendToVscode','full')"
          type="primary" title="Full Result View" icon="el-icon-rank" size="mini" circle>
        </el-button>
        <el-input class="left-search-input" v-model="searchInput" size="mini" style="width:200px;" 
          :placeholder="$t('Input To Search Data')" :clearable="true" />
        <el-button @click="$emit('insert')" :title="$t('Insert')" size="mini">
          <i class="el-icon-circle-plus-outline"></i>
          <span style="line-height: 14px;font-size: 14px;">{{$t('Insert')}}</span>
        </el-button>
        <el-button class="delete-button" size="mini"
          @click="$emit('deleteConfirm');" :title="$t('delete')">
          <i class="el-icon-delete"></i>
          <span style="line-height: 14px;font-size: 14px;">{{$t('delete')}}</span>
        </el-button>
        <el-button @click="$emit('export');" size="mini"
          style="margin-left: 15px;" :title="$t('Export')">
          <div>
            <svg t="1726449136707" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7832" width="12" height="12"><path d="M634.88 244.5312V102.4l389.12 276.48-389.12 276.48v-142.1824q-14.5408-0.5632-29.184-0.3072A512.6656 512.6656 0 0 0 204.8 716.8c13.6192-238.6944 194.56-434.7392 430.08-472.2688z" fill="var(--input-color)" p-id="7833"></path><path d="M961.8432 1015.7056A101.5808 101.5808 0 0 1 921.6 1024H102.4a102.7072 102.7072 0 0 1-102.4-102.4V102.4a101.5808 101.5808 0 0 1 8.2944-40.2432A102.8096 102.8096 0 0 1 102.4 0h243.2a38.4 38.4 0 0 1 0 76.8H128a51.2 51.2 0 0 0-51.2 51.2v768a51.2 51.2 0 0 0 51.2 51.2h768a51.2 51.2 0 0 0 51.2-51.2v-217.6a38.4 38.4 0 0 1 76.8 0V921.6a102.8096 102.8096 0 0 1-62.1568 94.1056z" fill="var(--input-color)" p-id="7834"></path></svg>
            <span style="font-size: 13px;">{{$t('Export')}}</span>
          </div>
        </el-button>
        <!-- <el-button icon="el-icon-caret-right" :title="$t('Execute Sql')"
          style="color: #54ea54;" @click="$emit('run');"></el-button>
        <div style="display:inline-block;font-size:14px;padding-left: 8px;" class="el-pagination__total">
          {{ $t('Cost') }}: {{costTime}}ms
        </div> -->
    </div>
    <div class="right" style="display: flex;">
      <el-pagination @size-change="changePageSize"
        @current-change="page=>$emit('changePage',page,true)"
        @next-click="()=>$emit('changePage',1)"
        @prev-click="()=>$emit('changePage',-1)"
        :current-page.sync="page.pageNum"
        :page-size="page.pageSize"
        :layout="page.total!=null?'prev,pager, next, total':'prev, next'"
        :total="page.total">
      </el-pagination>
       <el-button size="mini" icon="icon-github" :title="$t('Star the project to represent support.')"
          @click='()=>$emit("sendToVscode", "openGithub")'></el-button>
    </div>
  </div>
</template>

<script>
export default {
  props: ["costTime", "search", "showFullBtn", "page"],
  data() {
    return {
      searchInput: null,
    };
  },
  methods: {
    changePageSize(size) {
      this.page.pageSize = size;
      vscodeEvent.emit("changePageSize", size);
      this.changePage(0);
    },
  },
  watch: {
    searchInput: function () {
      this.$emit("update:search", this.searchInput); // 将子组件的输入框的值传递给父组件 父组件需要用.sync
    },
  },
};
</script>

<style scoped>
.toolbar {
  margin-top: 3px;
  margin-bottom: 3px;
}

.el-button--mini.is-circle {
  padding: 6px;
}

.el-button--default {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  margin-left: 7px;
  [class*=el-icon-] + span {
    margin-left: 0px;
  }
}

.el-button:focus{
  color: inherit !important;
  background-color: var(--vscode-editor-background);
}

.el-pagination {
  padding: 0;
}
>>> .left-search-input .el-input--mini .el-input__inner{
  height: 29px;
}

.delete-button.el-button:hover {
  color: #ff4040;
}

</style>

<style>
.el-pagination span,.el-pagination li,
.btn-prev i,.btn-next i{
  line-height: 27px !important;
}
</style>