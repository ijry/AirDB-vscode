<template>
  <div class="toolbar" style="display: flex;justify-content: space-between;align-items: center;">
    <div class="left" style="flex: 1;">
        <el-button v-if="showFullBtn" @click="()=>$emit('sendToVscode','full')"
          type="primary" title="Full Result View" size="small" circle>
          <el-icon><FullScreen /></el-icon>
        </el-button>
        <el-button @click="$emit('insert')" size="small">
          <el-icon><CirclePlus /></el-icon>
          <span style="">{{$t('Insert')}}</span>
        </el-button>
        <el-button class="delete-button" size="small"
          @click="$emit('deleteConfirm');">
          <el-icon><Delete /></el-icon>
          <span style="">{{$t('delete')}}</span>
        </el-button>
        <el-button @click="$emit('export');" size="small"
          style="margin-left: 7px;">
          <el-icon><Download /></el-icon>
          <span>{{$t('Export')}}</span>
        </el-button>
        <el-button v-if="showOpenDesignBtn" @click='()=>$emit("sendToVscode", "designTable")' size="small"
          style="margin-left: 7px;">
            <el-icon><Edit /></el-icon>
            <span style="">{{$t('Struct')}}</span>
        </el-button>
    </div>
    <div class="right" style="display: flex;">
      <el-input class="left-search-input" v-model="searchInput" size="small" style="width:200px;margin-right: 10px;" 
          :placeholder="$t('Input To Search Data')" :clearable="true" />
       <el-button size="small" :title="$t('Star the project to represent support.')"
          @click='()=>$emit("sendToVscode", "openGithub")'>
          <i class="icon-github"></i>
       </el-button>
    </div>
  </div>
</template>

<script>
import { CirclePlus, Delete, Download, Edit, FullScreen } from '@element-plus/icons-vue';

export default {
  components: { CirclePlus, Delete, Download, Edit, FullScreen },
  props: ["costTime", "search", "showFullBtn", "showOpenDesignBtn"],
  emits: ["sendToVscode", "insert", "deleteConfirm", "export", "run", "update:search"],
  data() {
    return {
      searchInput: null,
    };
  },
  methods: {
  },
  watch: {
    searchInput: function () {
      this.$emit("update:search", this.searchInput);
    },
  },
};
</script>

<style scoped>
.toolbar {
  margin-top: 3px;
  margin-bottom: 3px;
}

.el-button--small.is-circle {
  padding: 6px;
}

.el-button--small {
  display: inline-flex;
  align-items: center;
  .el-icon + span {
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
:deep(.left-search-input .el-input--small .el-input__inner) {
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
