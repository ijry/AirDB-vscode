<template>
  <div class="rabbitmq-page">
    <el-form :inline="true" size="small" class="toolbar">
      <el-form-item label="Queue">
        <el-input v-model="queue" disabled class="queue-input"></el-input>
      </el-form-item>
      <el-form-item label="Count">
        <el-input-number v-model="form.count" :min="1" :max="500" controls-position="right"></el-input-number>
      </el-form-item>
      <el-form-item>
        <el-checkbox v-model="form.requeue">Requeue</el-checkbox>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="el-icon-refresh" :loading="loading" @click="read">Read</el-button>
      </el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" show-icon class="message"></el-alert>
    <el-table :data="messages" stripe border size="small" height="calc(100vh - 96px)">
      <el-table-column prop="routing_key" label="Routing Key" width="160" show-overflow-tooltip></el-table-column>
      <el-table-column prop="exchange" label="Exchange" width="150" show-overflow-tooltip></el-table-column>
      <el-table-column prop="payload_bytes" label="Bytes" width="90"></el-table-column>
      <el-table-column prop="redelivered" label="Redelivered" width="110"></el-table-column>
      <el-table-column prop="payload" label="Payload" min-width="320" show-overflow-tooltip></el-table-column>
      <el-table-column label="Properties" min-width="220" show-overflow-tooltip>
        <template slot-scope="scope">{{ JSON.stringify(scope.row.properties || {}) }}</template>
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
      queue: "",
      loading: false,
      error: "",
      messages: [],
      form: {
        count: 20,
        requeue: true,
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("config", ({ queue }) => {
        this.queue = queue;
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
      vscodeEvent.emit("readRabbitMQMessages", this.form);
    },
  },
};
</script>

<style scoped>
.rabbitmq-page {
  padding: 10px;
}
.toolbar {
  margin-bottom: 8px;
}
.queue-input {
  width: 260px;
}
.message {
  margin-bottom: 8px;
}
</style>
