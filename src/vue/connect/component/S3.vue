<template>
  <div>
    <section class="mt-5">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Region</label>
        <input class="w-64 field__input" placeholder="us-east-1" required v-model="connectionOption.region" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Endpoint</label>
        <input
          class="w-64 field__input"
          placeholder="https://s3.amazonaws.com or http://127.0.0.1:9000"
          v-model="connectionOption.endpoint"
        />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Default Bucket</label>
        <input class="w-64 field__input" placeholder="optional" v-model="connectionOption.bucket" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block mr-5 font-bold w-32">Path-style</label>
        <el-switch v-model="connectionOption.forcePathStyle"></el-switch>
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Access Key ID</label>
        <input class="w-64 field__input" placeholder="AKIA..." required v-model="connectionOption.accessKeyId" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Secret Access Key</label>
        <el-input
          size="small"
          class="w-64 border-0"
          placeholder="Secret Access Key"
          type="password"
          v-model="connectionOption.secretAccessKey"
          show-password
        />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Session Token</label>
        <el-input
          size="small"
          class="w-64 border-0"
          placeholder="optional"
          type="password"
          v-model="connectionOption.sessionToken"
          show-password
        />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Connection Timeout</label>
        <input class="w-64 field__input" placeholder="5000" type="number" v-model="connectionOption.connectTimeout" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Request Timeout</label>
        <input class="w-64 field__input" placeholder="30000" type="number" v-model="connectionOption.requestTimeout" />
      </div>
    </section>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
  mounted() {
    if (!this.connectionOption.region) this.connectionOption.region = "us-east-1";
    if (this.connectionOption.forcePathStyle == null) this.connectionOption.forcePathStyle = false;
    if (this.connectionOption.useSSL == null) this.connectionOption.useSSL = true;
    if (!this.connectionOption.connectTimeout) this.connectionOption.connectTimeout = 5000;
    if (!this.connectionOption.requestTimeout) this.connectionOption.requestTimeout = 30000;
  },
};
</script>
