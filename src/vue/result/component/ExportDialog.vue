<template>
  <el-dialog :title="$t('Export Option')" :model-value="visible" width="580px" top="6vh" @close="$emit('update:visible', false)">
    <el-form :model="exportOption">
      <el-form-item :label="$t('Export File Type')">
        <el-select v-model="exportOption.type" size="small">
          <el-option label="Sql" value="sql"></el-option>
          <el-option label="Xlsx" value="xlsx"></el-option>
          <el-option label="Json" value="json"></el-option>
          <el-option label="Csv" value="csv"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item :label="$t('Remove Limit')">
        <el-switch v-model="exportOption.withOutLimit"></el-switch>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" size="default" :loading="loading" @click="loading = true; $emit('exportHandle', exportOption);">
          {{ $t('Export') }}
        </el-button>
        <el-button @click="$emit('update:visible', false)" size="default">
          {{ $t('Cancel') }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script>
export default {
  props: ["visible"],
  emits: ["update:visible", "exportHandle"],
  data() {
    return {
      loading: false,
      exportOption: {
        withOutLimit: true,
        type: "xlsx",
      },
    }
  },
  watch: {
    visible() {
      this.loading = false;
    }
  }
}
</script>

<style>
</style>
