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
    vscodeEvent.on("lang", (lang) => {
      console.log('onLang', lang)
      let locale = 'en'
      if (lang == 'zh-cn' || lang == 'zh-tw') {
        locale = 'zh'
      }
      this.$i18n.locale = locale
      console.log(this.$i18n)
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
