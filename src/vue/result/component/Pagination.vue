<template>
    <div style="display: flex;">
        <el-pagination @size-change="changePageSize"
            @current-change="page=>$emit('changePage',page,true)"
            @next-click="()=>$emit('changePage',1)"
            @prev-click="()=>$emit('changePage',-1)"
            :current-page.sync="page.pageNum"
            :page-size="page.pageSize"
            :layout="page.total!=null?'prev,pager, next, total':'prev, next'"
            :total="page.total">
        </el-pagination>
    </div>
  </template>
  
  <script>
  export default {
    props: ["page"],
    data() {
      return {
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
    },
  };
  </script>
  
  <style scoped>
  
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