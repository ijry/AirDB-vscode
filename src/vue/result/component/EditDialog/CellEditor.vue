<template>
  <div>
    <template v-if="type=='date'">
      <el-date-picker value-format="yyyy-MM-dd" :value="value" @input="sync"></el-date-picker>
    </template>
    <template v-else-if="type=='time'">
      <el-time-picker value-format="HH:mm:ss" :value="value" @input="sync"></el-time-picker>
    </template>
    <template v-else-if="isDateTime(type)">
      <el-date-picker value-format="yyyy-MM-dd HH:mm:ss" type="datetime" :value="value" @input="sync"></el-date-picker>
    </template>
    <template v-else-if="isText(type, value) > 0">
      <el-input class="w-full" :rows="isText(type, value)" type="textarea" :value="value" @input="sync"></el-input>
    </template>
    <el-input v-else :value="value" @input="sync"></el-input>
  </div>
</template>

<script>
export default {
  props: ["type", "value"],
  methods: {
    isDateTime(type){
      if(!type)return false;
      type=type.toUpperCase()
      return type=='DATETIME' || type=='TIMESTAMP' || type=='TIMESTAMP WITHOUT TIME ZONE' ||type=='TIMESTAMP WITH TIME ZONE'
    },
    isText(type, value){
      if (!type) return 0;
      let rows = 0
      // 判断内容长度超过一定字数则显示textarea
      if (value.length > 100) rows = 2
      if (value.length > 200) rows = 5
      if (type == 'text' || type == 'mediumtext' || type == 'longtext') {
        rows = 5
      }
      return rows
    },
    sync(value) {
      // console.log(value)
      this.$emit("input", value)
    },
  },
}
</script>

<style scoped>
.el-icon-time {
  line-height: 35px;
}

.el-date-editor {
  width: 100% !important;
}
.el-date-editor input {
  text-align: center;
}
</style>