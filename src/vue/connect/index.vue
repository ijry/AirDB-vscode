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
          connectionOption.dbType == 'MongoDB' ||
          connectionOption.dbType == 'Redis'
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
        ['MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'ElasticSearch'].includes(connectionOption.dbType)
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
    icon:
      "data:image/svg+xml;base64,PHN2ZyB0PSIxNzI2ODA3OTQzNDc3IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjE2MTY5IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHBhdGggZD0iTTg3MC40IDk3Mi44SDE1My42Yy01Ni4zMiAwLTEwMi40LTQ2LjA4LTEwMi40LTEwMi40VjE1My42YzAtNTYuMzIgNDYuMDgtMTAyLjQgMTAyLjQtMTAyLjRoNzE2LjhjNTYuMzIgMCAxMDIuNCA0Ni4wOCAxMDIuNCAxMDIuNHY3MTYuOGMwIDU2LjMyLTQ2LjA4IDEwMi40LTEwMi40IDEwMi40eiIgZmlsbD0iIzUxQjQ0QyIgcC1pZD0iMTYxNzAiPjwvcGF0aD48cGF0aCBkPSJNMzM1LjM2IDM0NS4wODhjLTExLjc3NiAwLTE1Ljg3Mi0xMC43NTItMTcuNDA4LTE0Ljg0OC0zLjA3Mi01LjYzMi02LjY1Ni0xMS4yNjQtOS43MjgtMTYuMzg0bDEuNTM2LTUuNjMyLTMuNTg0IDIuMDQ4Yy0xMy4zMTItMTMuODI0LTguMTkyLTIzLjU1Mi00LjA5Ni0yOC4xNiA0LjYwOC01LjEyIDEwLjc1Mi03LjY4IDE3LjQwOC03LjY4IDQuNjA4IDAgOS43MjggMS41MzYgMTQuMzM2IDMuNTg0IDE0Ljg0OCA3LjY4IDIzLjU1MiAxOS45NjggMjMuNTUyIDMzLjI4IDAgMTAuMjQtMS4wMjQgMjguMTYtMTYuODk2IDMyLjc2OC0xLjUzNiAwLjUxMi0zLjU4NCAxLjAyNC01LjEyIDEuMDI0TTg1NS41NTIgODcwLjRjLTYuNjU2IDAtMTEuNzc2LTQuMDk2LTE1LjM2LTYuNjU2LTE0LjMzNi0xMC4yNC0yOC4xNi0xNy40MDgtNDMuMDA4LTI1LjA4OC0xNS4zNi03LjY4LTMxLjIzMi0xNS4zNi00NS41NjgtMjYuMTEyLTE1Ljg3Mi0xMS43NzYtMzQuMzA0LTI3LjEzNi00Ni41OTItNTAuMTc2LTIuMDQ4LTMuNTg0LTguMTkyLTE0Ljg0OC00LjA5Ni0yNi4xMTIgMy41ODQtOS43MjggMTMuMzEyLTEzLjgyNCAxOS45NjgtMTUuODcyIDIwLjk5Mi02LjY1NiA0NS4wNTYtMTMuODI0IDcxLjE2OC0xNC44NDhsLTEuNTM2LTEuMDI0Yy0zMC4yMDgtMjIuNTI4LTU3LjM0NC00My4wMDgtOTAuMTEyLTUwLjY4OC00NS4wNTYtMTAuNzUyLTY0LjUxMi00MC45Ni03Ny44MjQtNjkuNjMyLTguNzA0LTE4LjQzMi0xNi44OTYtMzcuMzc2LTI0LjU3Ni01Ni4zMi0xNi44OTYtNDAuNDQ4LTM0LjMwNC04MS45Mi01OS4zOTItMTE4Ljc4NGEzOTkuNzY5NiAzOTkuNzY5NiAwIDAgMC0xNTEuNTUyLTEzNi43MDRjLTE2Ljg5Ni04LjcwNC0zOS40MjQtMTguNDMyLTY0LjUxMi0xOC40MzJoLTQuMDk2Yy0yMC40OCAwLTM3LjM3Ni02LjY1Ni01Mi43MzYtMjAuNDgtMTIuOC0xMS4yNjQtMjkuMTg0LTE3LjQwOC00Ni41OTItMjQuMDY0bC04LjE5Mi0zLjA3MmEyNC4wNjQgMjQuMDY0IDAgMCAwLTguMTkyLTIuMDQ4Yy00LjA5NiAyLjA0OC01LjYzMiA0LjA5NiAwIDEzLjMxMiA4LjcwNCAxMi44IDE4LjQzMiAyNi42MjQgMjkuMTg0IDQxLjQ3MiAxOS45NjggMjYuNjI0IDMwLjcyIDU2LjgzMiAzNy4zNzYgNzkuODcyIDkuNzI4IDMzLjI4IDIwLjQ4IDU5LjM5MiA0MC45NiA4MC4zODQgMTguOTQ0IDE5LjQ1NiA5LjIxNiA0MS40NzIgMy4wNzIgNTUuODA4bC01LjYzMiAyLjU2IDMuNTg0IDEuNTM2Yy0xNy40MDggNDAuNDQ4LTE3LjQwOCA4My40NTYgMC41MTIgMTM4Ljc1MiAxLjUzNiA0LjYwOCAzLjU4NCA5LjIxNiA2LjE0NCAxMi44bDAuNTEyIDAuNTEyYzIuNTYtMjUuNiA1LjEyLTUzLjc2IDI1LjYtNzcuODI0IDQuNjA4LTcuNjggMTAuMjQtMTYuMzg0IDIxLjUwNC0xNi4zODQgMTUuODcyIDEuNTM2IDE4LjQzMiAxNC44NDggMTkuNDU2IDE5LjQ1NiAxOS45NjggNTQuMjcyIDQ5LjY2NCAxMDEuMzc2IDc2LjI4OCAxNDEuMzEyIDIuMDQ4IDMuNTg0IDIuNTYgNy42OCAxLjAyNCAxMS4yNjQtMS41MzYgMy41ODQtNS4xMiA2LjY1Ni04LjcwNCA3LjE2OC0yLjA0OCAwLjUxMi00LjYwOCAwLjUxMi02LjY1NiAwLjUxMi0xNC44NDggMC0yNC4wNjQtOS4yMTYtNTAuNjg4LTM4LjkxMi04LjE5Mi04LjcwNC0xMy44MjQtMTguOTQ0LTE4Ljk0NC0yOC4xNmwtNC4wOTYtNi42NTZjLTAuNTEyIDUuMTItMS4wMjQgOS4yMTYtMi4wNDggMTMuMzEyLTYuMTQ0IDIzLjU1Mi0yMi4wMTYgMzcuODg4LTQwLjk2IDM3Ljg4OC0xMS43NzYgMC0yMy41NTItNS42MzItMzQuMzA0LTE2LjM4NC0yMy41NTItMjQuMDY0LTM2LjM1Mi01NC43ODQtNDAuOTYtOTcuMjgtNC42MDgtNDIuNDk2IDAtODIuNDMyIDEzLjgyNC0xMTkuMjk2IDMuNTg0LTEwLjI0IDMuNTg0LTE1LjM2LTMuNTg0LTI0LjA2NC0yNC41NzYtMjkuNjk2LTM2LjM1Mi02Ni41Ni00Ni4wOC0xMDEuODg4LTguMTkyLTIyLjUyOC0yMC40OC00MS40NzItMzYuODY0LTYyLjk3Ni0xMi4yODgtMTUuODcyLTIzLjA0LTI5LjY5Ni0yOC42NzItNDguMTI4LTUuMTItMTguNDMyLTIuNTYtMzYuMzUyIDcuMTY4LTQ5LjY2NFMxODYuMzY4IDE1My42IDIwNC44IDE1My42YzM5LjQyNCAwIDcwLjY1NiAxOS45NjggOTYuNzY4IDM4LjRsNC4wOTYgMy4wNzJjNC42MDggMy41ODQgNy4xNjggNS42MzIgMTAuMjQgNS42MzIgODIuNDMyIDAgMTQxLjgyNCA0Ni41OTIgMTk1LjU4NCA5NC4yMDggNTIuNzM2IDQ2LjU5MiA5NC4yMDggMTA0Ljk2IDExOS44MDggMTY5Ljk4NCAxMC43NTIgMjcuMTM2IDIzLjU1MiA1My43NiAzNi4zNTIgNzkuODcyIDYuMTQ0IDEyLjI4OCAxMi4yODggMjUuMDg4IDE3LjkyIDM3Ljg4OCAzLjA3MiA2LjY1NiA3LjY4IDEwLjc1MiAxNS4zNiAxMy44MjQgNjQgMjYuMTEyIDExNS4yIDYxLjk1MiAxNTYuNjcyIDEwOS4wNTYgNi4xNDQgNi42NTYgMTIuMjg4IDE1Ljg3MiA5LjIxNiAyNS42LTMuNTg0IDExLjI2NC0xNS4zNiAxNC4zMzYtMjMuNTUyIDE1Ljg3Mi0xMC43NTIgMi41Ni0yMi4wMTYgNC4wOTYtMzIuNzY4IDYuMTQ0LTEyLjI4OCAyLjA0OC0yNS4wODggMy41ODQtMzcuMzc2IDcuMTY4IDUuMTIgNC42MDggMTAuNzUyIDcuNjggMTUuODcyIDEwLjI0IDI0LjA2NCAxMS43NzYgNDEuOTg0IDMwLjcyIDU4Ljg4IDQ4LjY0IDUuNjMyIDUuNjMyIDkuNzI4IDEwLjI0IDEzLjgyNCAxNC4zMzYgMTUuMzYgMTUuMzYgOC43MDQgMjYuNjI0IDYuMTQ0IDI5LjY5Ni0yLjA0OCA0LjYwOC02LjY1NiA3LjE2OC0xMi4yODggNy4xNjgiIGZpbGw9IiNGRkZGRkYiIHAtaWQ9IjE2MTcxIj48L3BhdGg+PC9zdmc+",
    text: "My",
    bg: "#fef3e2",
    color: "#d97706",
  },
  PostgreSQL: {
    icon:
      "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIKICAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj4KCjxzdmcgd2lkdGg9IjQzMi4wNzFwdCIgaGVpZ2h0PSI0NDUuMzgzcHQiIHZpZXdCb3g9IjAgMCA0MzIuMDcxIDQ0NS4zODMiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGlkPSJvcmdpbmFsIiBzdHlsZT0iZmlsbC1ydWxlOm5vbnplcm87Y2xpcC1ydWxlOm5vbnplcm87c3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLW1pdGVybGltaXQ6NDsiPgoJPC9nPgo8ZyBpZD0iTGF5ZXJfeDAwMjBfMyIgc3R5bGU9ImZpbGwtcnVsZTpub256ZXJvO2NsaXAtcnVsZTpub256ZXJvO2ZpbGw6bm9uZTtzdHJva2U6I0ZGRkZGRjtzdHJva2Utd2lkdGg6MTIuNDY1MTtzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6NDsiPgo8cGF0aCBzdHlsZT0iZmlsbDojMDAwMDAwO3N0cm9rZTojMDAwMDAwO3N0cm9rZS13aWR0aDozNy4zOTUzO3N0cm9rZS1saW5lY2FwOmJ1dHQ7c3Ryb2tlLWxpbmVqb2luOm1pdGVyOyIgZD0iTTMyMy4yMDUsMzI0LjIyN2MyLjgzMy0yMy42MDEsMS45ODQtMjcuMDYyLDE5LjU2My0yMy4yMzlsNC40NjMsMC4zOTJjMTMuNTE3LDAuNjE1LDMxLjE5OS0yLjE3NCw0MS41ODctN2MyMi4zNjItMTAuMzc2LDM1LjYyMi0yNy43LDEzLjU3Mi0yMy4xNDhjLTUwLjI5NywxMC4zNzYtNTMuNzU1LTYuNjU1LTUzLjc1NS02LjY1NWM1My4xMTEtNzguODAzLDc1LjMxMy0xNzguODM2LDU2LjE0OS0yMDMuMzIyICAgIEMzNTIuNTE0LTUuNTM0LDI2Mi4wMzYsMjYuMDQ5LDI2MC41MjIsMjYuODY5bC0wLjQ4MiwwLjA4OWMtOS45MzgtMi4wNjItMjEuMDYtMy4yOTQtMzMuNTU0LTMuNDk2Yy0yMi43NjEtMC4zNzQtNDAuMDMyLDUuOTY3LTUzLjEzMywxNS45MDRjMCwwLTE2MS40MDgtNjYuNDk4LTE1My44OTksODMuNjI4YzEuNTk3LDMxLjkzNiw0NS43NzcsMjQxLjY1NSw5OC40NywxNzguMzEgICAgYzE5LjI1OS0yMy4xNjMsMzcuODcxLTQyLjc0OCwzNy44NzEtNDIuNzQ4YzkuMjQyLDYuMTQsMjAuMzA3LDkuMjcyLDMxLjkxMiw4LjE0N2wwLjg5Ny0wLjc2NWMtMC4yODEsMi44NzYtMC4xNTcsNS42ODksMC4zNTksOS4wMTljLTEzLjU3MiwxNS4xNjctOS41ODQsMTcuODMtMzYuNzIzLDIzLjQxNmMtMjcuNDU3LDUuNjU5LTExLjMyNiwxNS43MzQtMC43OTcsMTguMzY3YzEyLjc2OCwzLjE5Myw0Mi4zMDUsNy43MTYsNjIuMjY4LTIwLjIyNCAgICBsLTAuNzk1LDMuMTg4YzUuMzI1LDQuMjYsNC45NjUsMzAuNjE5LDUuNzIsNDkuNDUyYzAuNzU2LDE4LjgzNCwyLjAxNywzNi40MDksNS44NTYsNDYuNzcxYzMuODM5LDEwLjM2LDguMzY5LDM3LjA1LDQ0LjAzNiwyOS40MDZjMjkuODA5LTYuMzg4LDUyLjYtMTUuNTgyLDU0LjY3Ny0xMDEuMTA3Ii8+CjxwYXRoIHN0eWxlPSJmaWxsOiMzMzY3OTE7c3Ryb2tlOm5vbmU7IiBkPSJNNDAyLjM5NSwyNzEuMjNjLTUwLjMwMiwxMC4zNzYtNTMuNzYtNi42NTUtNTMuNzYtNi42NTVjNTMuMTExLTc4LjgwOCw3NS4zMTMtMTc4Ljg0Myw1Ni4xNTMtMjAzLjMyNmMtNTIuMjctNjYuNzg1LTE0Mi43NTItMzUuMi0xNDQuMjYyLTM0LjM4bC0wLjQ4NiwwLjA4N2MtOS45MzgtMi4wNjMtMjEuMDYtMy4yOTItMzMuNTYtMy40OTZjLTIyLjc2MS0wLjM3My00MC4wMjYsNS45NjctNTMuMTI3LDE1LjkwMiAgICBjMCwwLTE2MS40MTEtNjYuNDk1LTE1My45MDQsODMuNjNjMS41OTcsMzEuOTM4LDQ1Ljc3NiwyNDEuNjU3LDk4LjQ3MSwxNzguMzEyYzE5LjI2LTIzLjE2MywzNy44NjktNDIuNzQ4LDM3Ljg2OS00Mi43NDhjOS4yNDMsNi4xNCwyMC4zMDgsOS4yNzIsMzEuOTA4LDguMTQ3bDAuOTAxLTAuNzY1Yy0wLjI4LDIuODc2LTAuMTUyLDUuNjg5LDAuMzYxLDkuMDE5Yy0xMy41NzUsMTUuMTY3LTkuNTg2LDE3LjgzLTM2LjcyMywyMy40MTYgICAgYy0yNy40NTksNS42NTktMTEuMzI4LDE1LjczNC0wLjc5NiwxOC4zNjdjMTIuNzY4LDMuMTkzLDQyLjMwNyw3LjcxNiw2Mi4yNjYtMjAuMjI0bC0wLjc5NiwzLjE4OGM1LjMxOSw0LjI2LDkuMDU0LDI3LjcxMSw4LjQyOCw0OC45NjljLTAuNjI2LDIxLjI1OS0xLjA0NCwzNS44NTQsMy4xNDcsNDcuMjU0YzQuMTkxLDExLjQsOC4zNjgsMzcuMDUsNDQuMDQyLDI5LjQwNmMyOS44MDktNi4zODgsNDUuMjU2LTIyLjk0Miw0Ny40MDUtNTAuNTU1ICAgIGMxLjUyNS0xOS42MzEsNC45NzYtMTYuNzI5LDUuMTk0LTM0LjI4bDIuNzY4LTguMzA5YzMuMTkyLTI2LjYxMSwwLjUwNy0zNS4xOTYsMTguODcyLTMxLjIwM2w0LjQ2MywwLjM5MmMxMy41MTcsMC42MTUsMzEuMjA4LTIuMTc0LDQxLjU5MS03YzIyLjM1OC0xMC4zNzYsMzUuNjE4LTI3LjcsMTMuNTczLTIzLjE0OHoiLz4KPHBhdGggZD0iTTIxNS44NjYsMjg2LjQ4NGMtMS4zODUsNDkuNTE2LDAuMzQ4LDk5LjM3Nyw1LjE5MywxMTEuNDk1YzQuODQ4LDEyLjExOCwxNS4yMjMsMzUuNjg4LDUwLjksMjguMDQ1YzI5LjgwNi02LjM5LDQwLjY1MS0xOC43NTYsNDUuMzU3LTQ2LjA1MWMzLjQ2Ni0yMC4wODIsMTAuMTQ4LTc1Ljg1NCwxMS4wMDUtODcuMjgxIi8+CjxwYXRoIGQ9Ik0xNzMuMTA0LDM4LjI1NmMwLDAtMTYxLjUyMS02Ni4wMTYtMTU0LjAxMiw4NC4xMDljMS41OTcsMzEuOTM4LDQ1Ljc3OSwyNDEuNjY0LDk4LjQ3MywxNzguMzE2YzE5LjI1Ni0yMy4xNjYsMzYuNjcxLTQxLjMzNSwzNi42NzEtNDEuMzM1Ii8+CjxwYXRoIGQ9Ik0yNjAuMzQ5LDI2LjIwN2MtNS41OTEsMS43NTMsODkuODQ4LTM0Ljg4OSwxNDQuMDg3LDM0LjQxN2MxOS4xNTksMjQuNDg0LTMuMDQzLDEyNC41MTktNTYuMTUzLDIwMy4zMjkiLz4KPHBhdGggc3R5bGU9InN0cm9rZS1saW5lam9pbjpiZXZlbDsiIGQ9Ik0zNDguMjgyLDI2My45NTNjMCwwLDMuNDYxLDE3LjAzNiw1My43NjQsNi42NTNjMjIuMDQtNC41NTIsOC43NzYsMTIuNzc0LTEzLjU3NywyMy4xNTVjLTE4LjM0NSw4LjUxNC01OS40NzQsMTAuNjk2LTYwLjE0Ni0xLjA2OWMtMS43MjktMzAuMzU1LDIxLjY0Ny0yMS4xMzMsMTkuOTYtMjguNzM5Yy0xLjUyNS02Ljg1LTExLjk3OS0xMy41NzMtMTguODk0LTMwLjMzOCAgICBjLTYuMDM3LTE0LjYzMy04Mi43OTYtMTI2Ljg0OSwyMS4yODctMTEwLjE4M2MzLjgxMy0wLjc4OS0yNy4xNDYtOTkuMDAyLTEyNC41NTMtMTAwLjU5OWMtOTcuMzg1LTEuNTk3LTk0LjE5LDExOS43NjItOTQuMTksMTE5Ljc2MiIvPgo8cGF0aCBkPSJNMTg4LjYwNCwyNzQuMzM0Yy0xMy41NzcsMTUuMTY2LTkuNTg0LDE3LjgyOS0zNi43MjMsMjMuNDE3Yy0yNy40NTksNS42Ni0xMS4zMjYsMTUuNzMzLTAuNzk3LDE4LjM2NWMxMi43NjgsMy4xOTUsNDIuMzA3LDcuNzE4LDYyLjI2Ni0yMC4yMjljNi4wNzgtOC41MDktMC4wMzYtMjIuMDg2LTguMzg1LTI1LjU0N2MtNC4wMzQtMS42NzEtOS40MjgtMy43NjUtMTYuMzYxLDMuOTk0eiIvPgo8cGF0aCBkPSJNMTg3LjcxNSwyNzQuMDY5Yy0xLjM2OC04LjkxNywyLjkzLTE5LjUyOCw3LjUzNi0zMS45NDJjNi45MjItMTguNjI2LDIyLjg5My0zNy4yNTUsMTAuMTE3LTk2LjMzOWMtOS41MjMtNDQuMDI5LTczLjM5Ni05LjE2My03My40MzYtMy4xOTNjLTAuMDM5LDUuOTY4LDIuODg5LDMwLjI2LTEuMDY3LDU4LjU0OGMtNS4xNjIsMzYuOTEzLDIzLjQ4OCw2OC4xMzIsNTYuNDc5LDY0LjkzOCIvPgo8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGO3N0cm9rZS13aWR0aDo0LjE1NTtzdHJva2UtbGluZWNhcDpidXR0O3N0cm9rZS1saW5lam9pbjptaXRlcjsiIGQ9Ik0xNzIuNTE3LDE0MS43Yy0wLjI4OCwyLjAzOSwzLjczMyw3LjQ4LDguOTc2LDguMjA3YzUuMjM0LDAuNzMsOS43MTQtMy41MjIsOS45OTgtNS41NTljMC4yODQtMi4wMzktMy43MzItNC4yODUtOC45NzctNS4wMTVjLTUuMjM3LTAuNzMxLTkuNzE5LDAuMzMzLTkuOTk2LDIuMzY3eiIvPgo8cGF0aCBzdHlsZT0iZmlsbDojRkZGRkZGO3N0cm9rZS13aWR0aDoyLjA3NzU7c3Ryb2tlLWxpbmVjYXA6YnV0dDtzdHJva2UtbGluZWpvaW46bWl0ZXI7IiBkPSJNMzMxLjk0MSwxMzcuNTQzYzAuMjg0LDIuMDM5LTMuNzMyLDcuNDgtOC45NzYsOC4yMDdjLTUuMjM4LDAuNzMtOS43MTgtMy41MjItMTAuMDA1LTUuNTU5Yy0wLjI3Ny0yLjAzOSwzLjc0LTQuMjg1LDguOTc5LTUuMDE1YzUuMjM5LTAuNzMsOS43MTgsMC4zMzMsMTAuMDAyLDIuMzY4eiIvPgo8cGF0aCBkPSJNMzUwLjY3NiwxMjMuNDMyYzAuODYzLDE1Ljk5NC0zLjQ0NSwyNi44ODgtMy45ODgsNDMuOTE0Yy0wLjgwNCwyNC43NDgsMTEuNzk5LDUzLjA3NC03LjE5MSw4MS40MzUiLz4KPHBhdGggc3R5bGU9InN0cm9rZS13aWR0aDozOyIgZD0iTTAsNjAuMjMyIi8+CjwvZz4KPC9zdmc+Cg==",
    text: "PG",
    bg: "#e8f0ff",
    color: "#2563eb",
  },
  Oracle: {
    text: "OR",
    bg: "#fff1f2",
    color: "#e11d48",
  },
  SqlServer: {
    icon:
      "data:image/png;base64,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",
    text: "MS",
    bg: "#eef2ff",
    color: "#4338ca",
  },
  SQLite: {
    icon:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgNjcuNzY0IDc0Ljc2NCIgZmlsbD0iI2ZmZiIgZmlsbC1ydWxlPSJldmVub2RkIiBzdHJva2U9IiMwMDAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHVzZSB4bGluazpocmVmPSIjQiIgeD0iNC44ODIiIHk9IjQuODgyIi8+PGRlZnM+PGxpbmVhckdyYWRpZW50IHgxPSI1Ny42NiUiIHkxPSIyLjA4JSIgeDI9IjU3LjY2JSIgeTI9Ijk0LjQ2JSIgaWQ9IkEiPjxzdG9wIHN0b3AtY29sb3I9IiM5N2Q5ZjYiIG9mZnNldD0iMCUiLz48c3RvcCBzdG9wLWNvbG9yPSIjMGY4MGNjIiBvZmZzZXQ9IjkyLjAyNCUiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48c3ltYm9sIGlkPSJCIiBvdmVyZmxvdz0idmlzaWJsZSI+PGcgc3Ryb2tlPSJub25lIiBmaWxsLXJ1bGU9Im5vbnplcm8iPjxwYXRoIGQ9Ik00NS4wMzkgMi45MjdINC44ODJDMi4xODYgMi45MjcgMCA1LjExMyAwIDcuODA5djQ0LjI4N2MwIDIuNjk2IDIuMTg2IDQuODgyIDQuODgyIDQuODgyaDI2LjM2MmMtLjI5My0xMy4xNjEgNC4xOTgtMzguNzAzIDEzLjcwOC01NC4wOXoiIGZpbGw9IiMwZjgwY2MiLz48cGF0aCBkPSJNNDMuNDc3IDQuMjY1SDQuODgyYTMuNDcgMy40NyAwIDAgMC0zLjQ2NiAzLjQ2NnY0MS4wNTZjOC43NjgtMy4zNjggMjEuOTE5LTYuMjY4IDMxLjAxOS02LjEzMmEyODIuNDYgMjgyLjQ2IDAgMCAxIDExLjE1LTM4LjM5eiIgZmlsbD0idXJsKCNBKSIvPjxwYXRoIGQ9Ik01NC40MTIgMS4zODVDNTEuNjU4LTEuMDU2IDQ4LjMyOS0uMDggNDUuMDM5IDIuODNsLTEuNTYyIDEuNDI1Yy01LjYyNCA1Ljg1OC0xMC43NCAxNy4wMDgtMTIuNDU4IDI1LjQ1NGEyMy4yMyAyMy4yMyAwIDAgMSAxLjQ0NSA0LjE1OSwuMjE1Ljk3Ni4yMTUuOTk2cy0uMDQ5LS4xOTUtLjI1NC0uNzgxbC0uMTM3LS4zOWMtLjAyOC0uMDcyLS4wNTctLjE0NC0uMDg4LS4yMTUtLjM3MS0uODQ5LTEuMzY3LTIuNjU2LTEuODI2LTMuNDM3YTg1LjggODUuOCAwIDAgMC0xLjAwNiAzLjEzNGMxLjI4OSAyLjM2MyAyLjA3IDYuNDA1IDIuMDcgNi40MDVzLS4wNjgtLjI2NC0uMzktMS4xNzJjLS4yOTMtLjgxLTEuNzE4LTMuMzItMS45NTMtMy45MDUtLjU4NiAyLjE0OC0uODEgMy41OTMtLjYwNSAzLjk0NC4zOTEuNjg0Ljc4MSAxLjk1MyAxLjEyMyAzLjE2M2E3My40MiA3My40MiAwIDAgMSAxLjI4OSA2LjUwMmwuMDQ5LjYwNWMtLjEwMSAyLjQ0MS0uMDUyIDQuODg3LjE0NiA3LjMyMy4yNTQgMy4wNTYuNzMyIDUuNjgyIDEuMzM4IDcuMDg4bC40MS0uMjI1Yy0uOTc2LTIuNzczLTEuMjUtNi4zOTUtMS4wOTQtMTAuNTg0LjI0NC02LjM5NSAxLjcwOS0xNC4xMDggNC40MzMtMjIuMTQ0QzQxLjAxNiAxOC45MiA0Ny4zODIgOS4xNzYgNTMuMjIxIDQuNTI4IDQ3LjkgOS4zMzIgNDAuNzA0IDI0Ljg3NiAzOC41NTYgMzAuNjI2Yy0yLjQxMiA2LjQ0NC00LjEyIDEyLjQ5Ny01LjE1NSAxOC4yODcgMS43NzctNS40MjggNy41MTgtNy43NzIgNy41MTgtNy43NzJzMi45MjktMy40NzYgNi4xMTItOC40NDVsLTYuMjk4IDEuNjc5LTIuMDMxLjg5OHM1LjE3NS0zLjE1NCA5LjYzNy00LjU4OWM2LjEyMi05LjYzNyAxMi42OTMtMjMuNDMyIDYuMDczLTI5LjMxIiBmaWxsPSIjMDAzYjU3Ii8+PC9nPjwvc3ltYm9sPjwvc3ZnPg==",
    text: "SQ",
    bg: "#e6f6ff",
    color: "#0ea5e9",
  },
  MongoDB: {
    icon:
      "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNjlwdCIgaGVpZ2h0PSI2OXB0IiB2aWV3Qm94PSIwIDAgNjkgNjkiIHZlcnNpb249IjEuMSI+CjxnIGlkPSJzdXJmYWNlMSI+CjxwYXRoIHN0eWxlPSIgc3Ryb2tlOm5vbmU7ZmlsbC1ydWxlOm5vbnplcm87ZmlsbDpyZ2IoMzQuOTAxOTYxJSw1OC44MjM1MjklLDIxLjE3NjQ3MSUpO2ZpbGwtb3BhY2l0eToxOyIgZD0iTSAzMy43NzM0MzggMS4yMTA5MzggTCAzNy41NzQyMTkgNC41MTU2MjUgQyAzOC40MDIzNDQgNS4xMDkzNzUgMzkuMzY3MTg4IDUuNjY0MDYyIDQwLjQ0OTIxOSA2LjE2NDA2MiBDIDQzLjYyODkwNiA3LjYzNjcxOSA0Ni42NTIzNDQgOS4xNzk2ODggNDkuMzY3MTg4IDEwLjgzMjAzMSBDIDU1LjgwODU5NCAxNC43NDYwOTQgNjAuMTU2MjUgMTkuMDcwMzEyIDYzLjI1NzgxMiAyMy43OTI5NjkgQyA2NS4xMjUgMjYuNjQ0NTMxIDY2LjExNzE4OCAyOS42MDU0NjkgNjYuMjAzMTI1IDMyLjU4NTkzOCBDIDY2LjUxNTYyNSA0MS40OTIxODggNTkuOTE3OTY5IDQ5LjEzNjcxOSA0Ni42MTcxODggNTUuNDkyMTg4IEMgNDQuNDUzMTI1IDU2LjUgNDIuMTE3MTg4IDU3LjQyMTg3NSAzOS42Mjg5MDYgNTguMjUzOTA2IEMgMzguMzEyNSA1OC4yNTM5MDYgMzcuNjg3NSA1Ny43ODkwNjIgMzcuMTQ0NTMxIDU3LjM1OTM3NSBDIDM2LjEzMjgxMiA1Ni41NzAzMTIgMzUuNTE1NjI1IDU1LjY2Nzk2OSAzNS4yMDMxMjUgNTQuNzczNDM4IEMgMzQuNzM0Mzc1IDUzLjY5NTMxMiAzNC40Mjk2ODggNTIuNjE3MTg4IDM0LjU4MjAzMSA1MS41MDc4MTIgTCAzNC41ODIwMzEgNTEuMDAzOTA2IEMgMzQuNDcyNjU2IDUwLjg3NSAzMy4zMTI1IDEuNDQxNDA2IDMzLjc3MzQzOCAxLjIxMDkzOCBaIE0gMzMuNzczNDM4IDEuMjEwOTM4ICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDQyLjM1Mjk0MSUsNjcuNDUwOTglLDI4LjIzNTI5NCUpO2ZpbGwtb3BhY2l0eToxOyIgZD0iTSAzMy43NzM0MzggMS4xMDE1NjIgQyAzMy42MTcxODggMC45NTcwMzEgMzMuNDYwOTM4IDEuMDY2NDA2IDMzLjMwODU5NCAxLjEzNjcxOSBDIDMzLjM4MjgxMiAxLjg1NTQ2OSAzMi44Mzk4NDQgMi41IDMxLjk4ODI4MSAzLjExMzI4MSBDIDMxLjA5NzY1NiAzLjcyMjY1NiAyOS44MTY0MDYgNC4xOTE0MDYgMjguNTc0MjE5IDQuNjkxNDA2IEMgMjEuNjc1NzgxIDcuNDU3MDMxIDE2LjI0MjE4OCAxMC43OTY4NzUgMTEuODk0NTMxIDE0LjUzMTI1IEMgNi4xMDkzNzUgMTkuNTU0Njg4IDMuMTI1IDI0Ljk0MTQwNiAyLjI3NzM0NCAzMC42MTMyODEgQyAxLjg5MDYyNSAzMi42NTYyNSAzLjY3NTc4MSAzOS44NzUgNS4wNzAzMTIgNDEuOTU3MDMxIEMgOC44NzEwOTQgNDcuNDg0Mzc1IDE1LjY5OTIxOSA1Mi4xMTcxODggMjQuNTQ2ODc1IDU2LjEzNjcxOSBDIDI2LjczMDQ2OSA1Ny4xMDkzNzUgMjkuMDM1MTU2IDU4LjAxOTUzMSAzMS40NDUzMTIgNTguODY3MTg4IEMgMzIuMTQ0NTMxIDU4Ljg2NzE4OCAzMi4yMjI2NTYgNTguNTc4MTI1IDMyLjMzNTkzOCA1OC4zNjMyODEgQyAzMi42NDQ1MzEgNTcuOTA2MjUgMzIuODc1IDU3LjQzNzUgMzMuMDM1MTU2IDU2Ljk2NDg0NCBMIDM0LjU5Mzc1IDUxLjU3ODEyNSBaIE0gMzMuNzczNDM4IDEuMTAxNTYyICIvPgo8cGF0aCBzdHlsZT0iIHN0cm9rZTpub25lO2ZpbGwtcnVsZTpub256ZXJvO2ZpbGw6cmdiKDc2LjA3ODQzMSUsNzQuOTAxOTYxJSw3NC45MDE5NjElKTtmaWxsLW9wYWNpdHk6MTsiIGQ9Ik0gMzcuNTc0MjE5IDYwLjQ0MTQwNiBDIDM3LjczMDQ2OSA1OS42MTcxODggMzguNTg1OTM4IDU4LjkzMzU5NCAzOS41MTU2MjUgNTguMjUzOTA2IEMgMzguNjI1IDU4LjA3NDIxOSAzNy44ODY3MTkgNTcuNzE4NzUgMzcuMzQzNzUgNTcuMzIwMzEyIEMgMzYuODc1IDU2Ljk0NTMxMiAzNi40ODgyODEgNTYuNTQ2ODc1IDM2LjE4NzUgNTYuMTM2NzE5IEMgMzUuMTAxNTYyIDU0LjYyODkwNiAzNC44NzEwOTQgNTMuMDQ2ODc1IDM0LjU1ODU5NCA1MS41MDc4MTIgTCAzNC41NTg1OTQgNTAuNTc0MjE5IEMgMzQuMTcxODc1IDUwLjcxODc1IDM0LjA4OTg0NCA1MS45Mzc1IDM0LjA4OTg0NCA1Mi4xMTcxODggQyAzMy44NjMyODEgNTMuNzQ2MDk0IDMzLjM5NDUzMSA1NS4zNjcxODggMzIuNjkxNDA2IDU2Ljk2NDg0NCBDIDMyLjQ2MDkzOCA1Ny42MDkzNzUgMzIuMzA0Njg4IDU4LjI1MzkwNiAzMS40NDUzMTIgNTguODMyMDMxIEMgMzEuNDQ1MzEyIDU4LjkwMjM0NCAzMS40NDUzMTIgNTguOTcyNjU2IDMxLjUyMzQzOCA1OS4wODIwMzEgQyAzMi45MTc5NjkgNjAuOTg0Mzc1IDMzLjMwMDc4MSA2Mi45MjE4NzUgMzMuNTM5MDYyIDY0Ljg5ODQzOCBMIDMzLjUzOTA2MiA2NS42MTcxODggQyAzMy41MzkwNjIgNjYuNDgwNDY5IDMzLjQ2MDkzOCA2Ni4yOTY4NzUgMzUuMDA3ODEyIDY2LjU4NTkzOCBDIDM1LjYyODkwNiA2Ni42OTUzMTIgMzYuMzI0MjE5IDY2LjczMDQ2OSAzNi45NDkyMTkgNjYuOTQ1MzEyIEMgMzcuNDE0MDYyIDY2Ljk0NTMxMiAzNy40OTIxODggNjYuNzY1NjI1IDM3LjQ5MjE4OCA2Ni42MjEwOTQgTCAzNy4yNjE3MTkgNjUuNDM3NSBMIDM3LjI2MTcxOSA2Mi4xMzI4MTIgQyAzNy4xODM1OTQgNjEuNTU4NTk0IDM3LjQxNDA2MiA2MC45ODQzNzUgMzcuNTcwMzEyIDYwLjQ0NTMxMiBaIE0gMzcuNTc0MjE5IDYwLjQ0MTQwNiAiLz4KPC9nPgo8L3N2Zz4K",
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
    icon:
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI4NiIgcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCIgdmlld0JveD0iMCAwIDI1NiAyODYiIHN0eWxlPSItbXMtdHJhbnNmb3JtOiByb3RhdGUoMzYwZGVnKTsgLXdlYmtpdC10cmFuc2Zvcm06IHJvdGF0ZSgzNjBkZWcpOyB0cmFuc2Zvcm06IHJvdGF0ZSgzNjBkZWcpOyI+PHBhdGggZD0iTTE0LjM0NCA4MC4xNzNIMjAzLjU1YzIwLjg1MSAwIDM5LjQ3LTkuNTYgNTEuOTYzLTI0LjQ4N0MyMjkuNDUzIDIxLjgzNiAxODguNTUzIDAgMTQyLjUzIDBDODYuMTc4IDAgMzcuNDc2IDMyLjcxMSAxNC4zNDQgODAuMTczIiBmaWxsPSIjRjBCRjFBIi8+PHBhdGggZD0iTTE4Ny41MTUgMTAyLjQ0NEg1Ljc1NUExNDIuNTA4IDE0Mi41MDggMCAwIDAgMCAxNDIuNTNjMCAxMy45MjQgMi4wMzMgMjcuMzY3IDUuNzU1IDQwLjA4N2gxODEuNzZjMjEuODI1IDAgNDAuMDg3LTE3LjgxNiA0MC4wODctNDAuMDg3YzAtMjIuMjctMTcuODE2LTQwLjA4Ni00MC4wODctNDAuMDg2IiBmaWxsPSIjMDdBNURFIi8+PHBhdGggZD0iTTI1NiAyMjguNzU1Yy0xMi40MTQtMTQuNTkxLTMwLjg4My0yMy44NjgtNTEuNTYtMjMuODY4SDE0LjM0NkMzNy40NzcgMjUyLjM1IDg2LjE3OSAyODUuMDYgMTQyLjUzIDI4NS4wNmM0Ni4zMDYgMCA4Ny40MzYtMjIuMDk3IDExMy40Ny01Ni4zMDUiIGZpbGw9IiMzRUJFQjAiLz48cGF0aCBkPSJNNi41NzUgMTAyLjQ0NGExNDIuNDcyIDE0Mi40NzIgMCAwIDAgMCA4MC4xNzNoMTE4Ljk1OWMzLjExOC0xMi4wMjYgNC44OTktMjUuMzg4IDQuODk5LTQwLjA4N2MwLTE0LjY5OC0xLjc4MS0yOC4wNi00LjktNDAuMDg2SDYuNTc3eiIgZmlsbD0iIzIzMUYyMCIvPjxwYXRoIGQ9Ik03MC44MiAxOS4xNTNjLTI0LjA1MyAxNC4yNTMtNDQuMDk2IDM1LjYzMi01Ni41NjcgNjEuMDJoMTA1LjExNmMtMTAuNjktMjQuNDk3LTI3LjYxNS00NC45ODUtNDguNTUtNjEuMDIiIGZpbGw9IiNEN0EyMjkiLz48cGF0aCBkPSJNNzUuMjc0IDI2OC4xMzVjMjAuNDg4LTE2LjQ4IDM2Ljk2OC0zOC4zMDUgNDcuMjEzLTYzLjI0OEgxNC4yNTNjMTMuMzYyIDI2LjcyNSAzNC43NDIgNDguOTk1IDYxLjAyMSA2My4yNDgiIGZpbGw9IiMwMTlCOEYiLz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI4NiIgZmlsbD0icmdiYSgwLCAwLCAwLCAwKSIgLz48L3N2Zz4=",
    text: "ES",
    bg: "#ecfccb",
    color: "#65a30d",
  },
  SSH: {
    icon:
      "data:image/svg+xml;base64,PHN2ZyB0PSIxNzI2ODA4NTg1OTA4IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjIzNDM0IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHBhdGggZD0iTTkzNS4xMDQgMzg0SDg4Ljk2QTI0LjY0IDI0LjY0IDAgMCAwIDY0IDQwOC4zODR2NDM4Ljg0OGMwIDI2Ljg4IDIyLjI3MiA0OC43NjggNDkuNzkyIDQ4Ljc2OGg3OTYuNDE2YTQ5LjI4IDQ5LjI4IDAgMCAwIDQ5Ljc5Mi00OC43NjhWNDA4LjM4NEEyNC42NCAyNC42NCAwIDAgMCA5MzUuMTA0IDM4NHogbS01NTkuMjk2IDI3MS4yMzJMMjM5LjM2IDc2MS42NjRhMzMuNDcyIDMzLjQ3MiAwIDAgMS0zOS4xNjggMGMtMTAuODgtOC40NDgtMTAuODgtMjIuMDggMC0zMC41MjhMMzE2LjE2IDY0MCAyMDAuMTI4IDU0OC44NjRjLTcuMDQtNS40NC05LjcyOC0xMy40NC03LjE2OC0yMC44NjQgMi41Ni03LjQyNCA5Ljk4NC0xMy4yNDggMTkuNTg0LTE1LjIzMmEzMy4yOCAzMy4yOCAwIDAgMSAyNi43NTIgNS41NjhsMTM2LjUxMiAxMDYuNDMyQTE5LjQ1NiAxOS40NTYgMCAwIDEgMzg0IDY0MGMwIDUuNzYtMi45NDQgMTEuMi04LjE5MiAxNS4yMzJ6TTYxNiA3NjhoLTE0NEM0NTguNzUyIDc2OCA0NDggNzUzLjY2NCA0NDggNzM2czEwLjc1Mi0zMiAyNC0zMmgxNDRjMTMuMjQ4IDAgMjQgMTQuMzM2IDI0IDMycy0xMC43NTIgMzItMjQgMzJ6IG0yOTQuMjA4LTY0MEgxMTMuNzkyQzg2LjI3MiAxMjggNjQgMTQ3LjA3MiA2NCAxNzAuNjg4djEyOGMwIDExLjc3NiAxMS4xMzYgMjEuMzEyIDI0Ljg5NiAyMS4zMTJIOTM1LjA0YzEzLjc2IDAgMjQuODk2LTkuNiAyNC44OTYtMjEuMzEydi0xMjhjMC0yMy42MTYtMjIuMjcyLTQyLjY4OC00OS43OTItNDIuNjg4ek0yMjQgMjU2YTMyIDMyIDAgMSAxIDAtNjQgMzIgMzIgMCAwIDEgMCA2NHogbTkwLjQ5NiAwYTMyIDMyIDAgMSAxIDAtNjQgMzIgMzIgMCAwIDEgMCA2NHpNNDE2IDI1NmEzMiAzMiAwIDEgMSAwLTY0IDMyIDMyIDAgMCAxIDAgNjR6IiBmaWxsPSIjMmMyYzJjIiBwLWlkPSIyMzQzNSI+PC9wYXRoPjwvc3ZnPg==",
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
  components: { ElasticSearch, SQLite, SQLServer, SSH, SSL, FTP, LingyunUser },
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
        "Oracle",
        "SqlServer",
        "SQLite",
        "MongoDB",
        "Redis",
        "ElasticSearch",
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
