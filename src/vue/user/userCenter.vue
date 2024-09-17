<template>
    <div class="pa-4">
        <h1>{{ $t('UserCenter') }}</h1>
    </div>
</template>
  
<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent = getVscodeEvent();export default {
  data() {
    return {
      initData: { mainPwd: '' },
    };
  },
  mounted() {
    vscodeEvent
      .on("userCenterData", (data) => {
        this.initData = data;
      })
    vscodeEvent.emit("route-" + this.$route.name);
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  mounted() {
  },
  methods: {
    setMainPassword(pwd) {
      if (!pwd) return;
      this.emit("setMainPassword", {pwd: pwd});
    },
    refresh() {
      this.emit("route-" + this.$route.name);
    },
  },
  computed: {
    remainHeight() {
      return window.outerHeight - 340;
    },
  },
};
</script>

<style>
</style>