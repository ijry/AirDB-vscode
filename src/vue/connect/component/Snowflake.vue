<template>
  <div>
    <section class="mt-5">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">
          Account
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input
          class="w-64 field__input"
          placeholder="xy12345.ap-southeast-1.aws"
          required
          v-model="connectionOption.account"
        />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Host</label>
        <input
          class="w-64 field__input"
          placeholder="optional custom host"
          v-model="connectionOption.host"
        />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Port</label>
        <input class="w-64 field__input" placeholder="443" type="number" v-model="connectionOption.port" />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">
          Username
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input class="w-64 field__input" placeholder="AIRDB_USER" required v-model="connectionOption.user" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold pa-0">Password</label>
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
        <label class="inline-block w-32 mr-5 font-bold">Database</label>
        <input class="w-64 field__input" placeholder="ANALYTICS" v-model="connectionOption.database" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Schema</label>
        <input class="w-64 field__input" placeholder="PUBLIC" v-model="connectionOption.schema" />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Warehouse</label>
        <input class="w-64 field__input" placeholder="COMPUTE_WH" v-model="connectionOption.warehouse" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Role</label>
        <input class="w-64 field__input" placeholder="SYSADMIN" v-model="connectionOption.role" />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Authenticator</label>
        <input class="w-64 field__input" placeholder="SNOWFLAKE" v-model="connectionOption.authenticator" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Connection Timeout</label>
        <input class="w-64 field__input" placeholder="5000" type="number" v-model="connectionOption.connectTimeout" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Request Timeout</label>
        <input class="w-64 field__input" placeholder="10000" type="number" v-model="connectionOption.requestTimeout" />
      </div>
    </section>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
  mounted() {
    if (!this.connectionOption.port) this.connectionOption.port = 443;
    if (!this.connectionOption.schema) this.connectionOption.schema = "PUBLIC";
    if (!this.connectionOption.authenticator) this.connectionOption.authenticator = "SNOWFLAKE";
    if (this.connectionOption.useSSL == null) this.connectionOption.useSSL = true;
    if (!this.connectionOption.connectTimeout) this.connectionOption.connectTimeout = 5000;
    if (!this.connectionOption.requestTimeout) this.connectionOption.requestTimeout = 10000;
  },
};
</script>
