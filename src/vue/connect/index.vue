<template>
  <form @submit.prevent="tryConnect" class="flex flex-col mx-auto connect-container px-4">
    <h1 class="py-4 text-2xl">{{$t('Connect to Database Server')}}</h1>

    <blockquote class="p-3 mb-2 panel error" v-if="connect.error">
      <section class="panel__text">
        <div class="w-50 mr-5 font-bold">{{$t('Connection error!')}}</div>
        <span>{{ connect.errorMessage }}</span>
      </section>
    </blockquote>

    <blockquote class="p-3 mb-2 panel success" v-if="connect.success">
      <section class="panel__text">
        <div class="mr-5 font-bold w-36">{{$t('Success!')}}</div>
        <span>
          {{ connect.successMessage }}
        </span>
      </section>
    </blockquote>

    <section class="flex flex-wrap items-center">
      <div class="mb-2 mr-10">
        <label class="inline-block mr-5 font-bold">{{$t('Connection Storge')}}</label>
        <div class="inline-flex items-center">
          <el-radio v-model="connectionOption.isCloud" :label="0" :disabled="editModel">
            {{$t('Local')}}
          </el-radio>
          <el-radio v-model="connectionOption.isCloud" :label="1" :disabled="editModel">
            {{$t('Cloud')}}
          </el-radio>
        </div>
      </div>
    </section>

    <section class="flex flex-wrap items-center">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block mr-5 font-bold"
          @click="dialogVisible = true">{{$t('Connection Name')}}</label>
        <input
          class="field__input"
          style="min-width: 400px"
          :placeholder="$t('Connection Name')"
          v-model="connectionOption.name"
        />
      </div>
      <div class="inline-block mb-2 mr-10" v-if="connectionOption.isCloud == 0">
        <label class="inline-block mr-5 font-bold">{{$t('Connection Target')}}</label>
        <div class="inline-flex items-center">
          <el-radio v-model="connectionOption.global" :label="true">
            {{$t('Global')}}
          </el-radio>
          <el-radio v-model="connectionOption.global" :label="false">
            {{$t('Current Workspace')}}
          </el-radio>
        </div>
      </div>
    </section>

    <section class="mt-5">
      <label class="block font-bold">{{$t('Database Type')}}</label>
      <ul class="flex-wrap tab">
        <li
          class="tab__item"
          :class="{ 'tab__item--active': supportDatabase == connectionOption.dbType }"
          v-for="supportDatabase in supportDatabases"
          :key="supportDatabase"
          role="button"
          tabindex="0"
          @click="selectDatabaseType(supportDatabase)"
          @keydown.enter.prevent="selectDatabaseType(supportDatabase)"
          @keydown.space.prevent="selectDatabaseType(supportDatabase)"
        >
          <span
            class="tab__logo"
            :style="{ background: getDbLogo(supportDatabase).bg, color: getDbLogo(supportDatabase).color }"
            aria-hidden="true"
          >
            <img
              v-if="getDbLogo(supportDatabase).icon"
              class="tab__logo-image"
              :src="getDbLogo(supportDatabase).icon"
              alt=""
            />
            <span v-else class="tab__logo-text">{{ getDbLogo(supportDatabase).text }}</span>
          </span>
          <span class="tab__label">{{ supportDatabase }}</span>
        </li>
      </ul>
    </section>

    <ElasticSearch v-if="connectionOption.dbType == 'ElasticSearch'" :connectionOption="connectionOption" />
    <Kafka v-else-if="connectionOption.dbType == 'Kafka'" :connectionOption="connectionOption" />
    <SQLite
      v-else-if="connectionOption.dbType == 'SQLite'"
      :connectionOption="connectionOption"
      :sqliteState="sqliteState"
      @choose="choose('sqlite')"
      @install="installSqlite"
    />
    <SSH
      v-else-if="connectionOption.dbType == 'SSH'"
      :connectionOption="connectionOption"
      @choose="choose('privateKey')"
    />

    <template v-else>
      <section class="mt-5">
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">
            <span>{{$t('Host')}}</span>
            <span class="mr-1 text-red-600" title="required">*</span>
          </label>
          <input
            class="w-64 field__input"
            :placeholder="$t('The host of connection')"
            required
            v-model="connectionOption.host"
          />
        </div>
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">
            {{$t('Port')}}
            <span class="mr-1 text-red-600" title="required">*</span>
          </label>
          <input
            class="w-64 field__input"
            :placeholder="$t('The port of connection')"
            required
            type="number"
            v-model="connectionOption.port"
          />
        </div>
      </section>

      <SQLServer :connectionOption="connectionOption" v-if="connectionOption.dbType == 'SqlServer'" />

      <section>
        <div class="inline-block mb-2 mr-10" v-if="connectionOption.dbType != 'Redis'">
          <label class="inline-block w-32 mr-5 font-bold">
            {{$t('Username')}}
            <span class="mr-1 text-red-600" v-if="connectionOption.dbType != 'MongoDB'" title="required">*</span>
          </label>
          <input class="w-64 field__input" placeholder="Username"
            :required="connectionOption.dbType != 'MongoDB'" v-model="connectionOption.user" />
        </div>
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold pa-0">{{$t('Password')}}</label>
          <el-input size="small" class="w-64 border-0" :placeholder="$t('Password')"
            type="password" v-model="connectionOption.password" show-password	/>
        </div>
      </section>

      <section v-if="connectionOption.dbType != 'FTP' && connectionOption.dbType != 'MongoDB'">
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">
            {{ connectionOption.dbType == 'Oracle' ? 'Service Name' : $t('Databases') }}
          </label>
          <input
            class="w-64 field__input"
            :placeholder="connectionOption.dbType == 'Oracle' ? 'FREEPDB1 / ORCLPDB1' : $t('Special connection database')"
            v-model="connectionOption.database"
          />
        </div>
        <div class="inline-block mb-2 mr-10" v-if="connectionOption.dbType != 'Redis'">
          <label class="inline-block w-32 mr-5 font-bold">{{$t('Include Databases')}}</label>
          <input
            class="w-64 field__input"
            :placeholder="$t('Example') + ': mysql,information_schema'"
            v-model="connectionOption.includeDatabases"
          />
        </div>
      </section>

      <FTP v-if="connectionOption.dbType == 'FTP'" :connectionOption="connectionOption" />

      <section>
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">{{$t('Connection Timeout')}}</label>
          <input class="w-64 field__input" placeholder="5000" v-model="connectionOption.connectTimeout" />
        </div>
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">{{$t('Request Timeout')}}</label>
          <input
            class="w-64 field__input"
            placeholder="10000"
            type="number"
            v-model="connectionOption.requestTimeout"
          />
        </div>
      </section>

      <section class="flex items-center mb-2" v-if="connectionOption.dbType == 'MySQL'">
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">{{$t('Timezone')}}</label>
          <input class="w-64 field__input" placeholder="+HH:MM" v-model="connectionOption.timezone" />
        </div>
      </section>
    </template>

    <section class="flex items-center">
      <div
        class="inline-block mb-2 mr-10"
        v-if="connectionOption.dbType != 'SSH' && connectionOption.dbType != 'SQLite'"
      >
        <label class="mr-2 font-bold">{{$t('SSH Tunnel')}}</label>
        <el-switch v-model="connectionOption.usingSSH"></el-switch>
      </div>
      <div
        class="inline-block mb-2 mr-10"
        v-if="
          connectionOption.dbType == 'MySQL' ||
          connectionOption.dbType == 'PostgreSQL' ||
          connectionOption.dbType == 'KingbaseES' ||
          connectionOption.dbType == 'MongoDB' ||
          connectionOption.dbType == 'Redis' ||
          connectionOption.dbType == 'Kafka'
        "
      >
        <label class="inline-block mr-5 font-bold w-18">Use SSL</label>
        <el-switch v-model="connectionOption.useSSL"></el-switch>
      </div>
      <div class="inline-block mb-2 mr-10" v-if="connectionOption.dbType === 'MongoDB'">
        <label class="inline-block mr-5 font-bold w-18">SRV Record</label>
        <el-switch v-model="connectionOption.srv"></el-switch>
      </div>
      <div class="inline-block mb-2 mr-10" v-if="connectionOption.dbType === 'MongoDB'">
        <label class="inline-block mr-5 font-bold w-18">Use Connection String</label>
        <el-switch v-model="connectionOption.useConnectionString"></el-switch>
      </div>
    </section>
    <section class="flex items-center" v-if="connectionOption.useConnectionString">
      <div class="flex w-full mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Connection String</label>
        <input
          class="w-4/5 field__input"
          placeholder="e.g mongodb+srv://username:password@server-url/admin"
          v-model="connectionOption.connectionUrl"
        />
      </div>
    </section>

    <SSL
      :connectionOption="connectionOption"
      v-if="
        connectionOption.useSSL &&
        ['MySQL', 'PostgreSQL', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka'].includes(connectionOption.dbType)
      "
    />
    <SSH :connectionOption="connectionOption" v-if="connectionOption.usingSSH && connectionOption.dbType != 'SSH'" />

    <div class="mt-2">
      <button class="inline mr-4 button button--primary w-28" type="submit" v-loading="connect.loading">
        {{$t('Connect')}}
      </button>
      <button class="inline button button--primary w-28" @click="close">{{$t('Close')}}</button>
    </div>

    <el-dialog
      title="User"
      :visible.sync="dialogVisible"
      width="700px">
      <lingyun-user baseUrl="https://airdb.lingyun.net"
        @reg-success="userSuccess"
        @login-success="userSuccess"></lingyun-user>
    </el-dialog>
    
  </form>
</template>

<script>
import LingyunUser from './lingyun-user/LingyunUser.vue';
import ElasticSearch from "./component/ElasticSearch.vue";
import Kafka from "./component/Kafka.vue";
import SQLite from "./component/SQLite.vue";
import SQLServer from "./component/SQLServer.vue";
import SSH from "./component/SSH.vue";
import FTP from "./component/FTP.vue";
import SSL from "./component/SSL.vue";
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;
vscodeEvent = getVscodeEvent();
const fallbackDbLogo = {
  text: "DB",
  bg: "#f3f4f6",
  color: "#4b5563",
};

const dbLogoMap = {
  MySQL: {
    icon: require("@/../resources/icon/mysql.svg"),
    text: "My",
    bg: "#fef3e2",
    color: "#d97706",
  },
  PostgreSQL: {
    icon: require("@/../resources/icon/pg_server.svg"),
    text: "PG",
    bg: "#e8f0ff",
    color: "#2563eb",
  },
  KingbaseES: {
    text: "KB",
    bg: "#ecfeff",
    color: "#0891b2",
  },
  Dameng: {
    text: "DM",
    bg: "#f0fdf4",
    color: "#15803d",
  },
  Oracle: {
    text: "OR",
    bg: "#fff1f2",
    color: "#e11d48",
  },
  SqlServer: {
    icon: require("@/../resources/icon/mssql_server.png"),
    text: "MS",
    bg: "#eef2ff",
    color: "#4338ca",
  },
  SQLite: {
    icon: require("@/../resources/icon/sqlite-icon.svg"),
    text: "SQ",
    bg: "#e6f6ff",
    color: "#0ea5e9",
  },
  MongoDB: {
    icon: require("@/../resources/icon/mongodb-icon.svg"),
    text: "MG",
    bg: "#eafaf1",
    color: "#16a34a",
  },
  Redis: {
    text: "RD",
    bg: "#fef2f2",
    color: "#dc2626",
  },
  ElasticSearch: {
    icon: require("@/../resources/icon/elasticsearch.svg"),
    text: "ES",
    bg: "#ecfccb",
    color: "#65a30d",
  },
  Kafka: {
    text: "KA",
    bg: "#f8fafc",
    color: "#111827",
  },
  SSH: {
    icon: require("@/../resources/icon/ssh.svg"),
    text: "SH",
    bg: "#f3f4f6",
    color: "#475569",
  },
  FTP: {
    text: "FTP",
    bg: "#eef2ff",
    color: "#4f46e5",
  },
};

export default {
  name: "Connect",
  components: { ElasticSearch, Kafka, SQLite, SQLServer, SSH, SSL, FTP, LingyunUser },
  data() {
    return {
      dialogVisible: false,
      connectionOption: {
        isCloud: 0, // 是否存储云端
        cloudId: '', // 云端ID
        host: "127.0.0.1",
        dbPath: "",
        port: "3306",
        user: "root",
        authType: "default",
        password: "",
        encoding: "utf8",
        database: null,
        usingSSH: false,
        showHidden: false,
        includeDatabases: null,
        dbType: "MySQL",
        encrypt: true,
        connectionUrl: "",
        srv: false,
        esAuth: "none",
        brokers: "",
        clientId: "airdb",
        kafkaAuth: "none",
        global: true,
        key: null,
        // scheme: "http",
        timezone: "+00:00",
        ssh: {
          host: "",
          privateKeyPath: "",
          port: 22,
          username: "root",
          type: "password",
          watingTime: 5000,
          algorithms: {
            cipher: [],
          },
        },
      },
      sqliteState: false,
      type: "password",
      supportDatabases: [
        "MySQL",
        "PostgreSQL",
        "KingbaseES",
        "Dameng",
        "Oracle",
        "SqlServer",
        "SQLite",
        "MongoDB",
        "Redis",
        "ElasticSearch",
        "Kafka",
        "SSH",
        "FTP",
      ],
      connect: {
        loading: false,
        success: false,
        successMessage: "",
        error: false,
        errorMessage: "",
      },
      editModel: false,
    };
  },
  mounted() {
    vscodeEvent
      .on("edit", (node) => {
        this.editModel = true;
        console.log(node);
        this.connectionOption = node;
      })
      .on("connect", (node) => {
        this.editModel = false;
      })
      .on("choose", ({ event, path }) => {
        switch (event) {
          case "sqlite":
            this.connectionOption.dbPath = path;
            break;
          case "privateKey":
            this.connectionOption.ssh.privateKeyPath = path;
            break;
        }
        this.$forceUpdate();
      })
      .on("sqliteState", (sqliteState) => {
        this.sqliteState = sqliteState;
      })
      .on("error", (err) => {
        this.connect.loading = false;
        this.connect.success = false;
        this.connect.error = true;
        this.connect.errorMessage = err;
      })
      .on("success", (res) => {
        this.connect.loading = false;
        this.connect.error = false;
        this.connect.success = true;
        this.connect.successMessage = res.message;
        this.connectionOption.connectionKey = res.connectionKey;
        this.connectionOption.key = res.key;
        this.connectionOption.isGlobal = this.connectionOption.global;
      });
    vscodeEvent.emit("route-" + this.$route.name);
    // vscodeEvent.emit("loginSuccess", {token: '12'});
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  methods: {
    getDbLogo(type) {
      return dbLogoMap[type] || fallbackDbLogo;
    },
    selectDatabaseType(type) {
      this.connectionOption.dbType = type;
    },
    userSuccess(userState) {
      // console.log('#####%*&^**^*^*&',userState)
      vscodeEvent.emit("loginSuccess", userState);
    },
    installSqlite() {
      vscodeEvent.emit("installSqlite");
      this.sqliteState = true;
    },
    tryConnect() {
      if (!this.checkLogin()) return;
      this.connect.loading = true;
      vscodeEvent.emit("connecting", {
        connectionOption: this.connectionOption,
      });
    },
    choose(event) {
      let filters = {};
      switch (event) {
        case "sqlite":
          filters["SQLiteDb"] = ["db"];
          break;
        case "privateKey":
          filters["PrivateKey"] = ["key", "cer", "crt", "der", "pub", "pem", "pk"];
          break;
      }
      filters["File"] = ["*"];
      vscodeEvent.emit("choose", {
        event,
        filters,
      });
    },
    close() {
      vscodeEvent.emit("close");
    },
    checkLogin() {
      // 检测是否已经登录
      let userState = localStorage.getItem('userState');
      if (userState && 'undefined' !== userState) {
        userState = JSON.parse(userState);
        if (userState.token) {
          return true;
        }
      }
      this.dialogVisible = true;
      return false;
    }
  },
  watch: {
    "connectionOption.isCloud"(value) {
      if (value == 1) {
        this.checkLogin()
      }
    },
    "connectionOption.dbType"(value) {
      if (this.editModel) {
        return;
      }
      this.connectionOption.host = "127.0.0.1";
      switch (value) {
        case "MySQL":
          this.connectionOption.user = "root";
          this.connectionOption.port = 3306;
          this.connectionOption.database = null;
          break;
        case "PostgreSQL":
          this.connectionOption.user = "postgres";
          this.connectionOption.encrypt = false;
          this.connectionOption.port = 5432;
          this.connectionOption.database = "postgres";
          break;
        case "KingbaseES":
          this.connectionOption.user = "system";
          this.connectionOption.encrypt = false;
          this.connectionOption.port = 54321;
          this.connectionOption.database = "test";
          break;
        case "Dameng":
          this.connectionOption.user = "SYSDBA";
          this.connectionOption.encrypt = false;
          this.connectionOption.port = 5236;
          this.connectionOption.database = "SYSDBA";
          break;
        case "Oracle":
          this.connectionOption.user = "system";
          this.connectionOption.port = 1521;
          this.connectionOption.database = "FREEPDB1";
          break;
        case "SqlServer":
          this.connectionOption.user = "sa";
          this.connectionOption.encrypt = true;
          this.connectionOption.port = 1433;
          this.connectionOption.database = "master";
          break;
        case "ElasticSearch":
          this.connectionOption.host = "127.0.0.1:9200";
          this.connectionOption.user = null;
          this.connectionOption.port = null;
          this.connectionOption.database = null;
          break;
        case "Kafka":
          this.connectionOption.host = "127.0.0.1:9092";
          this.connectionOption.brokers = "127.0.0.1:9092";
          this.connectionOption.clientId = "airdb";
          this.connectionOption.kafkaAuth = "none";
          this.connectionOption.port = null;
          this.connectionOption.user = null;
          this.connectionOption.password = null;
          this.connectionOption.database = null;
          this.connectionOption.useSSL = false;
          break;
        case "Redis":
          this.connectionOption.port = 6379;
          this.connectionOption.user = null;
          this.connectionOption.database = "0";
          break;
        case "MongoDB":
          this.connectionOption.user = null;
          this.connectionOption.password = null;
          this.connectionOption.port = 27017;
          break;
        case "FTP":
          this.connectionOption.port = 21;
          this.connectionOption.user = null;
          break;
        case "SSH":
          break;
      }
      this.$forceUpdate();
    },
    "connectionOption.connectionUrl"(value) {
      let connectionUrl = this.connectionOption.connectionUrl;

      const srvRegex = /(?<=mongodb\+).+?(?=:\/\/)/;
      const srv = connectionUrl.match(srvRegex);
      if (srv) {
        this.connectionOption.srv = true;
        connectionUrl = connectionUrl.replace(srvRegex, "");
      }
      const userRegex = /(?<=\/\/).+?(?=\:)/;
      const user = connectionUrl.match(userRegex);
      if (user) {
        this.connectionOption.user = user[0];
        connectionUrl = connectionUrl.replace(userRegex, "");
      }
      const passwordRegex = /(?<=\/\/:).+?(?=@)/;
      const password = connectionUrl.match(passwordRegex);
      if (password) {
        this.connectionOption.password = password[0];
        connectionUrl = connectionUrl.replace(passwordRegex, "");
      }

      const hostRegex = /(?<=@).+?(?=[:\/])/;
      const host = connectionUrl.match(hostRegex);
      if (host) {
        this.connectionOption.host = host[0];
        connectionUrl = connectionUrl.replace(hostRegex, "");
      }

      if (!this.connectionOption.srv) {
        const portRegex = /(?<=\:).\d+/;
        const port = connectionUrl.match(portRegex);
        if (port) {
          this.connectionOption.port = port[0];
          connectionUrl = connectionUrl.replace(portRegex, "");
        }
      }

      this.$forceUpdate();
    },
  },
};
</script>

<style scoped>
.connect-container {
  width: 100%;
  max-width: 1300px;
}

.tab {
  border-bottom: 1px solid var(--vscode-dropdown-border);
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 0;
}

.tab__item {
  list-style: none;
  cursor: pointer;
  font-size: 13px;
  min-height: 34px;
  padding: 6px 10px;
  color: var(--vscode-foreground);
  border: 1px solid transparent;
  border-bottom-color: transparent;
  border-radius: 4px 4px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  outline: none;
  transition: color 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.tab__item:hover,
.tab__item:focus {
  color: var(--vscode-panelTitle-activeForeground);
  border-color: var(--vscode-dropdown-border);
  background: var(--vscode-list-hoverBackground);
}

.tab__item--active {
  color: var(--vscode-panelTitle-activeForeground);
  border-color: var(--vscode-dropdown-border);
  border-bottom-color: var(--vscode-panelTitle-activeForeground);
  background: var(--vscode-editor-background);
}

.tab__logo {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 22px;
  overflow: hidden;
}

.tab__logo-image {
  max-width: 16px;
  max-height: 16px;
  display: block;
  object-fit: contain;
}

.tab__logo-text {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.tab__label {
  line-height: 1;
  white-space: nowrap;
}

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.button {
  padding: 4px 14px;
  border: 0;
  display: inline-block;
  outline: none;
  @apply font-bold;
  cursor: pointer;
}

.button--primary {
  color: var(--vscode-button-foreground);
  background-color: var(--vscode-button-background);
}

.button--primary:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.panel {
  border-left-width: 5px;
  border-left-style: solid;
  background: var(--vscode-textBlockQuote-background);
}

.error {
  border-color: var(--vscode-inputValidation-errorBorder);
}

.success {
  border-color: green;
}

.panel__text {
  line-height: 2;
}
</style>
