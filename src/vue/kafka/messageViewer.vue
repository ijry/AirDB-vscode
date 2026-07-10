<template>
  <div class="kafka-page">
    <el-form :inline="true" size="small" class="toolbar">
      <el-form-item label="Topic">
        <el-input v-model="topic" disabled class="topic-input"></el-input>
      </el-form-item>
      <el-form-item label="Partition">
        <el-input v-model="form.partition" placeholder="all" class="small-input"></el-input>
      </el-form-item>
      <el-form-item label="Start">
        <el-select v-model="form.startMode" class="mode-input">
          <el-option label="Latest" value="latest"></el-option>
          <el-option label="Beginning" value="beginning"></el-option>
          <el-option label="Offset" value="offset"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="Offset" v-if="form.startMode == 'offset'">
        <el-input v-model="form.offset" class="small-input"></el-input>
      </el-form-item>
      <el-form-item label="Limit">
        <el-input-number v-model="form.limit" :min="1" :max="1000" controls-position="right"></el-input-number>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="el-icon-refresh" :loading="loading" @click="read">Read</el-button>
      </el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" show-icon class="message"></el-alert>
    <el-table :data="messages" stripe border size="small" height="calc(100vh - 96px)">
      <el-table-column prop="partition" label="Partition" width="90"></el-table-column>
      <el-table-column prop="offset" label="Offset" width="110"></el-table-column>
      <el-table-column prop="timestamp" label="Timestamp" width="170"></el-table-column>
      <el-table-column prop="key" label="Key" width="180" show-overflow-tooltip></el-table-column>
      <el-table-column prop="value" label="Value" min-width="300" show-overflow-tooltip></el-table-column>
      <el-table-column label="Headers" min-width="220" show-overflow-tooltip>
        <template slot-scope="scope">{{ JSON.stringify(scope.row.headers || {}) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;

export default {
  data() {
    return {
      topic: "",
      loading: false,
      error: "",
      messages: [],
      form: {
        partition: "",
        startMode: "latest",
        offset: "",
        limit: 100,
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("config", ({ topic }) => {
        this.topic = topic;
      })
      .on("messages", (rows) => {
        this.loading = false;
        this.error = "";
        this.messages = rows || [];
      })
      .on("error", (message) => {
        this.loading = false;
        this.error = message;
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  methods: {
    read() {
      this.loading = true;
      this.error = "";
      vscodeEvent.emit("readKafkaMessages", this.form);
    },
  },
};
</script>

<style scoped>
.kafka-page {
  padding: 10px;
}
.toolbar {
  margin-bottom: 8px;
}
.topic-input {
  width: 260px;
}
.small-input {
  width: 110px;
}
.mode-input {
  width: 130px;
}
.message {
  margin-bottom: 8px;
}
</style>
