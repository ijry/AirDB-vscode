<template>
  <div>
    <section class="mt-5">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Host</label>
        <input class="w-64 field__input" placeholder="127.0.0.1" required v-model="connectionOption.host" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">AMQP Port</label>
        <input class="w-64 field__input" placeholder="5672" type="number" required v-model="connectionOption.port" />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Management Port</label>
        <input class="w-64 field__input" placeholder="15672" type="number" v-model="connectionOption.managementPort" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">VHost</label>
        <input class="w-64 field__input" placeholder="/" v-model="vhost" />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Username</label>
        <input class="w-64 field__input" placeholder="guest" v-model="connectionOption.user" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Password</label>
        <el-input size="small" class="w-64 border-0" placeholder="guest" type="password" v-model="connectionOption.password" show-password />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Connection Timeout</label>
        <input class="w-64 field__input" placeholder="5000" v-model="connectionOption.connectTimeout" />
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
  computed: {
    vhost: {
      get() {
        return this.connectionOption.vhost || this.connectionOption.database || "/";
      },
      set(value) {
        this.connectionOption.vhost = value;
        this.connectionOption.database = value;
      },
    },
  },
  mounted() {
    if (!this.connectionOption.vhost) this.connectionOption.vhost = this.connectionOption.database || "/";
    this.connectionOption.database = this.connectionOption.vhost;
  },
};
</script>
