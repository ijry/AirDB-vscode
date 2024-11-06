<template>
  <div class="toolbar" style="display: flex;justify-content: space-between;align-items: center;">
    <div class="left" style="flex: 1;">
        <el-button v-if="showFullBtn" @click="()=>$emit('sendToVscode','full')"
          type="primary" title="Full Result View" icon="el-icon-rank" size="small" circle>
        </el-button>
        <el-button @click="$emit('insert')" size="small">
          <i class="el-icon-circle-plus-outline"></i>
          <span style="">{{$t('Insert')}}</span>
        </el-button>
        <el-button class="delete-button" size="small"
          @click="$emit('deleteConfirm');">
          <i class="el-icon-delete"></i>
          <span style="">{{$t('delete')}}</span>
        </el-button>
        <el-button @click="$emit('export');" size="small"
          style="margin-left: 7px;">
          <i class="el-icon-download"></i>
          <span>{{$t('Export')}}</span>
        </el-button>
        <el-button v-if="showOpenDesignBtn" @click='()=>$emit("sendToVscode", "designTable")' size="small"
          style="margin-left: 7px;">
            <i class="el-icon-edit"></i>
            <span style="">{{$t('Struct')}}</span>
        </el-button>
        <!-- <el-button icon="el-icon-caret-right" :title="$t('Execute Sql')"
          style="color: #54ea54;" @click="$emit('run');"></el-button>
        <div style="display:inline-block;font-size:14px;padding-left: 8px;" class="el-pagination__total">
          {{ $t('Cost') }}: {{costTime}}ms
        </div> -->
    </div>
    <div class="right" style="display: flex;">
      <el-input class="left-search-input" v-model="searchInput" size="small" style="width:200px;margin-right: 10px;" 
          :placeholder="$t('Input To Search Data')" :clearable="true" />
       <el-button size="mini" icon="icon-github" :title="$t('Star the project to represent support.')"
          @click='()=>$emit("sendToVscode", "openGithub")'></el-button>
    </div>
  </div>
</template>

<script>
export default {
  props: ["costTime", "search", "showFullBtn", "showOpenDesignBtn"],
  data() {
    return {
      searchInput: null,
    };
  },
  methods: {
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

.el-button--small {
  display: inline-flex;
  align-items: center;
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