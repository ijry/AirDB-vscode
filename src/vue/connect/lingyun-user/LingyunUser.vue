<template>
    <el-tabs :stretch="false" v-model="currrentTab">
        <el-tab-pane
            :label="$t('Login')" name="login">
            <el-form class="pt-4" v-if="!qrloginShow" ref="loginForm" size="large" inline-message :model="loginForm" :rules="ruleLogin">
                <el-form-item prop="account">
                    <el-input type="text" prefix-icon="User" v-model="loginForm.account"
                    :placeholder="$t('Email/Mobile/Username')">
                    </el-input>
                </el-form-item>
                <el-form-item prop="password">
                    <el-input type="password" prefix-icon="Lock" v-model="loginForm.password"
                    :placeholder="$t('Please enter') + ' ' + $t('password')"
                    @keyup.enter="handleSubmit">
                    </el-input>
                </el-form-item>
                <!-- <el-form-item class="agreement">
                    <el-checkbox size="normal" v-model="loginForm.rememberLogin">
                    {{ $t('Remember me') }}
                    </el-checkbox>
                </el-form-item> -->
                <el-button id="Captcha" class="w-full submit-btn" size="large"
                    :loading="loginForm.loading" type="default" @click="handleLoginSubmit">
                    {{ $t('Login') }}
                </el-button>
                <div class="actions mt-4 flex justify-between">
                    <div>
                        <a :to="baseUrl + '/user/resetPassword'">{{ $t('Forget password') }}</a>
                    </div>
                    <div>
                        {{ $t('No Account') }}？
                        <span @click="currrentTab = 'register'">{{ $t('Sign up') }}</span>
                    </div>
                </div>
            </el-form>
        </el-tab-pane>
        <el-tab-pane
            :label="$t('Sign up')" name="register">
            <el-form class="pt-4" ref="form" inline-message :model="regData" :rules="regRule">
                <el-form-item prop="email">
                    <el-input size="large" type="text" prefix-icon="Message" v-model="regData.email"
                    :placeholder="$t('Please enter') + ' ' + $t('email')">
                    </el-input>
                </el-form-item>
                <el-form-item prop="verify">
                    <el-input size="large" autocomplete="off" type="text" prefix-icon="Lock"
                        v-model="regData.verify" :placeholder="$t('Please enter') + ' ' + $t('verify code')">
                        <template #append>
                            <xy-send-verify @verifysuccess="getVerifyTokenReg" :url="baseUrl + '/api/v1/email/verify/send'"
                                :type="$t('email')" :account="regData.email" :title="$t('Sign up')"></xy-send-verify>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item prop="password">
                    <el-input size="large" type="password"
                    v-model="regData.password" prefix-icon="Lock"
                    :placeholder="$t('Please enter') + ' ' + $t('password')">
                    </el-input>
                </el-form-item>
                <!-- <el-form-item prop="inviteCode" v-if="$store.state.app.siteInfo.regInvite > 0">
                    <el-input size="large" type="text" prefix-icon="Lock"
                    v-model="regData.inviteCode" :placeholder="'请输入邀请码' + inviteSuffix">
                    </el-input>
                </el-form-item> -->
                <div class="agreement">
                    <el-checkbox v-model="regData.agreement">{{$t('I have read and agree')}}</el-checkbox>
                    <a :to="baseUrl + '/agreement/agreement'" target="_blank">
                        《{{$t('User Terms')}}》
                    </a>
                    {{ $t('and') }}
                    <router-link :to="baseUrl + '/agreement/privacy'" target="_blank">
                        《{{$t('Privacy Policy')}}》
                    </router-link>
                </div>
                <el-button class="w-full mt-3 submit-btn" size="large" :loading="regData.loading"
                    type="default" @click="handleRegSubmit">
                    {{$t('Sign up')}}
                </el-button>
                <div class="actions mt-4 flex">
                    <div></div>
                    <div>
                        {{$t('Existing account')}}？
                        <span @click="currrentTab = 'login'">{{$t('Login')}}</span>
                    </div>
                </div>
            </el-form>
        </el-tab-pane>
    </el-tabs>
</template>

<script>
    import axios, { AxiosRequestConfig } from "axios";
    import xySendVerify from './xy-send-verify/xy-send-verify.vue'
    export default {
        name: 'LingyunUser',
        props: {
            baseUrl: ''
        },
        components: { xySendVerify },
        emits: ['login-success', 'reg-success'],
        data() {
            return {
                readonly: false,
                currrentTab: 'login',
                qrloginShow: false, // 二维码扫码登录
                verifyData: '',
                loginForm: {
                    rememberLogin: false,
                    loading: false,
                    account: '',
                    password: ''
                },
                ruleLogin: {
                    account: [
                        { required: true, message: '请填写账号', trigger: 'blur' }
                    ],
                    password: [
                        { required: true, message: '请填写密码', trigger: 'blur' },
                        { type: 'string', min: 6, message: '密码至少6位', trigger: 'blur' }
                    ]},
                regData: {
                    email: '',
                    password: '',
                    verify: '',
                    token: '',
                    agreement: false,
                    loading: false,
                },
                regRule: {
                    email: [
                        { required: true, message: this.$t('Please enter') + ' ' + this.$t('email'), trigger: 'blur' }
                    ],
                    password: [
                        { required: true, message: this.$t('Please enter') + ' ' + this.$t('password'), trigger: 'blur' },
                        { type: 'string', min: 6, message: this.$t('password') + ' ' + this.$t('password_length'), trigger: 'blur' }
                    ],
                    verify: [
                        { required: true, message: this.$t('Please enter') + ' ' + this.$t('verify_code'), trigger: 'blur' },
                    ],
                    token: [
                        { required: true, message: this.$t('please') + this.$t('send') + this.$t('verify_code'), trigger: 'blur' },
                    ]
                }
            }
        },
        methods: {
            getVerifyTokenReg (res) {
                this.regData.token = res.token;
            },
            handleLoginSubmit: async function () {
                if (this.loginForm.loading) {
                    return;
                }
                let data = this.loginForm;
                // if (this.verifyData) {
                //     data._verify = this.verifyData;
                // }
                this.loginForm.loading = true;
                let _this = this;
                setTimeout(function () {
                    _this.loginForm.loading = false;
                }, 5000);
                let url = this.baseUrl + '/api/v1/core/user/login';
                const response = await axios.post(url, data);
                let res = response.data;
                if (res.code == 200) {
                    // this.$store.commit('user/setToken', res.data.token);
                    // this.$store.commit('user/setUserInfo', res.data.userInfo);
                    // if (this.verifyData) {
                    //     this.$refs.sv.close();
                    // }
                    this.$message(res.msg);
                    // this.verifyData = '';

                    this.$emit('login-success', res.data);
                } else {
                    // if (res.code == 401003) {
                    //     // this.$refs.sv.open(res.data.verifyList);
                    //     return;
                    // } else {
                        this.$message(res.msg);
                    // }
                }
                this.loginForm.loading = false;
            },
            async handleRegSubmit() {
                if (!this.regData.agreement) {
                    this.$message(this.$t('You need agree terms'));
                    return false;
                }
                // this.$store.commit('app/setData', {key: 'inviteCode', value: this.form.inviteCode});
                this.regData.loading = true;
                let _this = this;
                setTimeout(function() {
                    _this.regData.loading = false;
                }, 5000);
                let url = this.baseUrl + '/api/v1/reg_email/user/register';
                const response = await axios.post(url, this.regData);
                let res = response.data;
                if (res.code == '200') {
                    this.$message(res.msg);
                    // this.$store.commit('user/setToken', res.data.token);
                    // this.$store.commit('user/setUserInfo', res.data.userInfo);
                    this.$emit('reg-success', res);
                } else {
                    this.$message(res.msg);
                }
                this.regData.loading = false
            }
        }
    }
</script>

<style>
</style>