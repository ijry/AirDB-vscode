<style scoped lang="less">
</style>
<template>
    <span @click="captchaSuccess">
        <span class="send-verify p-l-xs p-r-xs lh-1 cursor-pointer"
            :id="CaptchaId" type="text">
            <span @click="doClick">{{ label }}</span>
        </span>
    </span>
</template>
<script>
import axios, { AxiosRequestConfig } from "axios";
// import XyCaptha from '../xy-captcha/xy-captcha.vue';
export default {
    // components: {
    //     XyCaptha
    // },
    name: 'xySendVerify',
    props: {
        // 是否验证发送合法性
        verifyUser: {
            type: [Boolean,Number],
            default: false
        },
        // 是否需要传递account
        noNeedAccount: {
            type: Boolean,
            default: false
        },
        account: {
			type: String,
			default: ''
		},
        title: {
			type: String,
			default: ''
		},
		url: {
			type: String,
			default: '/v1/sms/verify/send'
		},
		type: {
			type: String,
			default: ''
		},
		time: {
			type: Number,
			default: 30
		},
    capthaOptions: Object
    },
    data() {
        return {
            // CaptchaId: 'Captcha' + this.$xyutil.guid(),
            label: this.$t('Send'),
            timeLeft: 0,
            capthaOptionsData: {}
        }
    },
    created: function () {
        if (!this.type) {
            this.type = this.$t('mobile');
        }
    },
    methods: {
        captchaSuccess() {
            this.sendVerify();
        },
        doClick(e) {
            if (this.timeLeft > 0) {
                e.stopPropagation();
			      }
            if (!this.account && !this.noNeedAccount) {
                this.$message(this.$t('Please enter') + this.type);
                e.stopPropagation();
            }
        },
        async sendVerify() {
            if (this.timeLeft > 0) {
              return;
            }
            if (!this.account && !this.noNeedAccount) {
              this.$message(this.$t('Please enter') + this.type);
              return false;
          }
          if (process.env.NODE_ENV == 'development') {
            this.timeLeft = 3
          } else {
            this.timeLeft = this.time;
          }
            this.label = this.$t('left') + this.timeLeft + 's';
            var timer = setInterval(()=>{
                this.timeLeft--
                if (this.timeLeft <= 0) {
                    this.label = this.$t('Send');
                    this.timeLeft = 0;
                    clearInterval(timer);
                } else {
                    this.label = this.$t('left') + this.timeLeft + 's'
                }
            }, 1000);
            let data = {};
            if (this.type == this.$t('mobile')) {
              data = {
                mobile: this.account,
                title: this.title
              };
            } else {
              data = {
                email: this.account,
                title: this.title
              };
            }
            // 是否发送验证合法性
            data.verifyUser = this.verifyUser
            const response = await axios.post(this.url, data);
            let res = response.data;
            if (res.code == '200') {
                this.$message(res.msg);
                // 事件
                this.$emit('verifysuccess', res.data)
            } else {
              this.$message(res.msg);
            }
        }
    }
}
</script>
