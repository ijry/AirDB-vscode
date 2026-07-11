<template>
  <div class="kafka-page">
    <el-form label-width="90px" size="small">
      <el-form-item label="Topic">
        <el-input v-model="topic" disabled></el-input>
      </el-form-item>
      <el-form-item label="Partition">
        <el-input v-model="form.partition" placeholder="optional"></el-input>
      </el-form-item>
      <el-form-item label="Key">
        <el-input v-model="form.key" placeholder="optional"></el-input>
      </el-form-item>
      <el-form-item label="Headers">
        <el-input type="textarea" :autosize="{ minRows: 3 }" v-model="headersText" placeholder="{&quot;source&quot;:&quot;airdb&quot;}"></el-input>
      </el-form-item>
      <el-form-item label="Value">
        <el-input type="textarea" :autosize="{ minRows: 10 }" v-model="form.value"></el-input>
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
      topic: "",
      loading: false,
      error: "",
      success: "",
      headersText: "{}",
      form: {
        partition: "",
        key: "",
        value: "",
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("config", ({ topic }) => {
        this.topic = topic;
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
      let headers = {};
      try {
        headers = this.headersText.trim() ? JSON.parse(this.headersText) : {};
      } catch (error) {
        this.error = `Invalid headers JSON: ${error.message}`;
        return;
      }
      this.loading = true;
      this.error = "";
      this.success = "";
      vscodeEvent.emit("sendKafkaMessage", { ...this.form, headers });
    },
  },
};
</script>

<style scoped>
.kafka-page {
  max-width: 920px;
  padding: 12px;
}
.message {
  margin-top: 8px;
}
</style>
