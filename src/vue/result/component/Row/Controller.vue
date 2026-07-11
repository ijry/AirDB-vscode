<template>
<div>
  <el-popover placement="bottom" :title="$t('Select columns to show')" width="200" trigger="click" type="primary">
    <el-checkbox-group v-model="toolbar.showColumns">
      <el-checkbox v-for="(column,index) in result.fields" :label="column.name" :key="index">
        {{ column.name }}
      </el-checkbox>
    </el-checkbox-group>
    <template #reference>
      <el-button circle title="Select columns to show" size="small">
        <el-icon><Search /></el-icon>
      </el-button>
    </template>
  </el-popover>
</div>
</template>

<script>
import { Search } from '@element-plus/icons-vue';

export default {
    components: { Search },
    props:['result','toolbar'],
    mounted(){
        console.log(this.result)
    }
};
</script>

<style>
</style>
