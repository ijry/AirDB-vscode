import Vue from "vue";
import App from "./App";
import ElementUI from "element-ui";
import locale from "element-ui/lib/locale/lang/en";
import UmyTable from "umy-table";
import "umy-table/lib/theme-chalk/index.css";
import "@/../public/theme/auto.css";
import "@/../public/theme/umyui.css";
import "../result/view.css";
import "../result/icon/iconfont.css";

Vue.use(ElementUI, { locale });
Vue.use(UmyTable);

Vue.config.productionTip = false;

new Vue({
  el: "#app",
  components: { App },
  template: "<App/>",
});
