<template>
  <div class="mt-5">
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="inline-block w-32 mr-5 font-bold">
          <span>Brokers</span>
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input
          class="field__input"
          style="width: 34rem"
          placeholder="127.0.0.1:9092,127.0.0.1:9093"
          required
          v-model="brokers"
        />
      </div>
    </section>
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Client ID</label>
        <input class="w-64 field__input" placeholder="airdb" v-model="connectionOption.clientId" />
      </div>
    </section>
    <section class="mb-2">
      <label class="inline-block mr-5 font-bold w-36">Authentication</label>
      <div class="inline-flex items-center">
        <el-radio v-model="connectionOption.kafkaAuth" label="none">None</el-radio>
        <el-radio v-model="connectionOption.kafkaAuth" label="plain">SASL Plain</el-radio>
        <el-radio v-model="connectionOption.kafkaAuth" label="scram-sha-256">SCRAM-SHA-256</el-radio>
        <el-radio v-model="connectionOption.kafkaAuth" label="scram-sha-512">SCRAM-SHA-512</el-radio>
      </div>
    </section>
    <section v-if="connectionOption.kafkaAuth && connectionOption.kafkaAuth != 'none'">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Username</label>
        <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Password</label>
        <el-input
          size="small"
          class="w-64 border-0"
          placeholder="Password"
          type="password"
          v-model="connectionOption.password"
          show-password
        />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">{{ $t('Connection Timeout') }}</label>
        <input class="w-64 field__input" placeholder="5000" v-model="connectionOption.connectTimeout" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">{{ $t('Request Timeout') }}</label>
        <input class="w-64 field__input" placeholder="30000" type="number" v-model="connectionOption.requestTimeout" />
      </div>
    </section>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
  computed: {
    brokers: {
      get() {
        return this.connectionOption.brokers || this.connectionOption.host;
      },
      set(value) {
        this.connectionOption.host = value;
        this.connectionOption.brokers = value;
      },
    },
  },
  mounted() {
    if (!this.connectionOption.clientId) this.connectionOption.clientId = "airdb";
    if (!this.connectionOption.kafkaAuth) this.connectionOption.kafkaAuth = "none";
    if (!this.connectionOption.brokers) {
      this.connectionOption.brokers = this.connectionOption.host || "127.0.0.1:9092";
    }
    this.connectionOption.host = this.connectionOption.brokers;
  },
};
</script>
