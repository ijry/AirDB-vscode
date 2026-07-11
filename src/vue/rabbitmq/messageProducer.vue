<template>
  <div class="rabbitmq-page">
    <el-form label-width="100px" size="small">
      <el-form-item label="Queue">
        <el-input v-model="queue" disabled></el-input>
      </el-form-item>
      <el-form-item label="Content Type">
        <el-input v-model="form.contentType"></el-input>
      </el-form-item>
      <el-form-item label="Persistent">
        <el-switch v-model="form.persistent"></el-switch>
      </el-form-item>
      <el-form-item label="Payload">
        <el-input type="textarea" :autosize="{ minRows: 10 }" v-model="form.payload"></el-input>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Promotion" :loading="loading" @click="send">Send</el-button>
      </el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" show-icon class="message"></el-alert>
    <el-alert v-if="success" :title="success" type="success" show-icon class="message"></el-alert>
  </div>
</template>

<script>
import { Promotion } from "@element-plus/icons-vue";
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;

export default {
  components: { Promotion },
  setup() { return { Promotion }; },
  data() {
    return {
      queue: "",
      loading: false,
      error: "",
      success: "",
      form: {
        payload: "",
        contentType: "text/plain",
        persistent: true,
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("config", ({ queue }) => {
        this.queue = queue;
      })
      .on("sent", (result) => {
        this.loading = false;
        this.error = "";
        this.success = `Sent: ${JSON.stringify(result)}`;
      })
      .on("error", (message) => {
        this.loading = false;
        this.success = "";
        this.error = message;
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  unmounted() {
    vscodeEvent.destroy();
  },
  methods: {
    send() {
      this.loading = true;
      this.error = "";
      this.success = "";
      vscodeEvent.emit("sendRabbitMQMessage", this.form);
    },
  },
};
</script>

<style scoped>
.rabbitmq-page {
  max-width: 920px;
  padding: 12px;
}
.message {
  margin-top: 8px;
}
</style>
