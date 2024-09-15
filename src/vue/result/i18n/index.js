import Vue from "vue";
import VueI18n from "vue-i18n";
 
Vue.use(VueI18n); // 全局挂载

let locale = 'en'
 
export const i18n = new VueI18n({
  locale: locale,
  messages: {
    zh: require("./lang/zh").default, // 中文语言包
    en: require("./lang/en").default // 英文语言包
  }
});
 
export default i18n;
