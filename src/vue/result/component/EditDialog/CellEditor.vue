<template>
  <div class="cell-content">
    <template v-if="type=='date'">
      <el-date-picker value-format="YYYY-MM-DD" v-model="innerValue"></el-date-picker>
    </template>
    <template v-else-if="type=='time'">
      <el-time-picker value-format="HH:mm:ss" v-model="innerValue"></el-time-picker>
    </template>
    <template v-else-if="isDateTime(type)">
      <el-date-picker value-format="YYYY-MM-DD HH:mm:ss" type="datetime" v-model="innerValue"></el-date-picker>
    </template>
    <template v-else-if="isText(type, innerValue) > 0">
      <el-input class="w-full" :rows="isText(type, innerValue)" type="textarea" v-model="innerValue"></el-input>
    </template>
    <el-input v-else v-model="innerValue"></el-input>
  </div>
</template>

<script>
export default {
  props: ["type", "modelValue"],
  emits: ["update:modelValue"],
  computed: {
    innerValue: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit("update:modelValue", value);
      },
    },
  },
  methods: {
    isDateTime(type){
      if(!type)return false;
      type=type.toUpperCase()
      return type=='DATETIME' || type=='TIMESTAMP' || type=='TIMESTAMP WITHOUT TIME ZONE' ||type=='TIMESTAMP WITH TIME ZONE'
    },
    isText(type, value){
      if (!type) return 0;
      let rows = 1
      // 判断内容长度超过一定字数则显示textarea
      if (value && value.length) {
        if (value.length > 100) rows = 2
        if (value.length > 200) rows = 5
      }
      if (type == 'text' || type == 'mediumtext' || type == 'longtext') {
        rows = 5
      }
      return rows
    },
  },
}
</script>

<style scoped>
.el-date-editor {
  width: 100% !important;
}
.el-date-editor input {
  text-align: center;
}
:deep(.el-textarea__inner) {
  min-height: 24px !important;
  line-height: 1.1;
}
.cell-content {
  padding-top: 5px;
}
</style>
