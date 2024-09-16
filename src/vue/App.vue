<template>
  <router-view></router-view>
</template>

<script>
import { getVscodeEvent } from "./util/vscode"

const vscodeEvent = getVscodeEvent()

export default {
  name: "App",
  mounted() {
    // 监听语言
    vscodeEvent.on("syncState", (state) => {
      console.log('syncState', state)
      localStorage.setItem('userState', JSON.stringify(state.userState)); // 用户登录信息
      let locale = 'en'
      if (state.lang == 'zh-cn' || state.lang == 'zh-tw') {
        locale = 'zh'
      }
      this.$i18n.locale = locale
    }).on("route", (path) => {
      // console.log('onRoute', path)
      if (this.$route.name == path) {
        vscodeEvent.emit("route-" + this.$route.name)
      } else {
        this.$router.push("/" + path)
      }
    })
    vscodeEvent.emit("init")
  },
  destroyed() {
    vscodeEvent.destroy()
  },
}
</script>
