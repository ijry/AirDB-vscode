<template>
    <div class="pa-4">
      <h1 class="my-4 max-w-sm mx-auto">AirDB {{ $t('UserCenter') }}</h1>
      <div class="max-w-sm mx-auto shadow-sm rounded-sm overflow-hidden">
        <div class="flex items-center p-4">
          <img class="w-16 h-16 rounded-full" src="https://via.placeholder.com/150" alt="Avatar">
          <div class="ml-4">
            <h2 class="text-xl font-semibold">
              {{ userState.userInfo.nickname }}
              <span class="text-sm">(uid: {{ userState.userInfo.id }})</span>
            </h2>
            <p class="text-gray-600">{{ userState.userInfo.email }}</p>
          </div>
        </div>
      </div>

      <div class="mt-3 max-w-sm mx-auto shadow-sm rounded-sm overflow-hidden">
        <div class="flex items-center p-4">
          <div class="w-full">
            <div class="w-full text-gray-600 flex justify-between">
              <div class="w-120px">{{ $t('Main password') }}</div>
              <div clas="flex-1 flex justify-end">
                <div class="mr-2">{{ replaceMiddleWithAsterisks(initData.mainPwd) }}</div>
                <el-button size="mini" @click="resetMainPwd" v-if="initData.mainPwd">{{ $t('Reset') }}</el-button>
                <el-button size="mini" @click="setMainPwd" v-else>{{ $t('Set') }}</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
</template>
  
<script>
import axios, { AxiosRequestConfig } from "axios";
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent = getVscodeEvent();
const inputPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/
export default {
  data() {
    return {
      baseUrl: 'https://airdb.lingyun.net',
      initData: { mainPwd: '' },
      userState: {
        token: '',
        userInfo: {
          avatar: '',
          nickname: '',
          emial: '',
        }
      },
    };
  },
  mounted() {
    vscodeEvent
      .on("syncState", (state) => {
        // if (localStorage.getItem('userState')) {
          this.userState = state.userState
        // }
      })
      .on("userCenterData", (data) => {
        this.initData = data;
      })
    vscodeEvent.emit("route-" + this.$route.name);
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  methods: {
    replaceMiddleWithAsterisks(str) {
      const length = str.length;
      if (length <= 2) {
          return str; // 如果字符串长度小于等于2，返回原字符串
      }

      const start = str.charAt(0); // 获取第一个字符
      const end = str.charAt(length - 1); // 获取最后一个字符
      const asterisks = '*'.repeat(length - 2); // 生成中间的 * 号

      return start + asterisks + end; // 拼接并返回
  },
    resetMainPwd(){
      this.$prompt(this.$t("Reset main password will delete all connect's password in cloud, you need fill every conns's password later."), this.$t('Tip'), {
          confirmButtonText: this.$t('Confirm'),
          cancelButtonText: this.$t('Cancel'),
          inputPlaceholder: this.$t('New Main password'),
          inputPattern: inputPattern,
          inputErrorMessage: this.$t('Require the main password to contain uppercase letters, lowercase letters, digits, and special characters.')
        }).then(async ({ value }) => {
          let url = this.baseUrl + '/api/v1/airdb/conns/resetMainPwd';
          const headers = {
              'Content-Type': 'application/json',
              'Authorization': this.userState.token
          };
          const response = await axios.post(url, {
            markEncrypt: '' // 本地默认字符串airdb2024加密后的结果，可以用于以后验证主密码是否正确。
          }, {
            headers: headers
          });
          let res = response.data;
          if (res.code == 200) {
            vscodeEvent.emit("setMainPassword", {pwd: value});
            this.initData.mainPwd = value;
            this.$message(res.msg);
          } else {
            this.$message(res.msg);
          }
        }).catch((err) => {
          this.$message({
            type: 'info',
            message: this.$t('Cancel') + JSON.stringify(err)
          });          
        });
    },
    setMainPwd(){
      this.$prompt(this.$t("Set a main password to encrypt your db's password in cloud sync, you need set the same main password if you have set one before."), this.$t('Tip'), {
          confirmButtonText: this.$t('Confirm'),
          cancelButtonText: this.$t('Cancel'),
          inputPlaceholder: this.$t('Main password'),
          inputPattern: inputPattern,
          inputErrorMessage: this.$t('Require the main password to contain uppercase letters, lowercase letters, digits, and special characters.')
        }).then(({ value }) => {
          // todo验证之前与之前密码是否一致
          vscodeEvent.emit("setMainPassword", {pwd: value});
          this.initData.mainPwd = value;
          this.$message(this.$t('Success'));
        }).catch(() => {     
        });
    },
    refresh() {
      vscodeEvent.emit("route-" + this.$route.name);
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