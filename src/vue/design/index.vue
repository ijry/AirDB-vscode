<template>
  <div class="px-4 py-4 ">
    <!-- <el-tag>{{ $t('Design.Table') }}:</el-tag>
    {{table}} -->
    <div class="flex justify-between">
      <div class="text-lg">
        {{$t('Db Type')}}: {{ dbType }}
      </div>
      <div>
        <el-button @click="init" type="default" title="Refresh" size="small">{{ $t('Refresh') }} </el-button>
      </div>
    </div>
    <ul class="tab mt-2">
      <li class="tab__item " :class="{'tab__item--active':activePanel=='column'}"
        @click="activePanel='column'">{{ $t('Design.Column') }} </li>
      <li class="tab__item " :class="{'tab__item--active':activePanel=='index'}"
        @click="activePanel='index'">{{ $t('Design.Index') }}</li>
    </ul>
    <div class="mt-2">
      <ColumnPanel v-if="activePanel=='column'" />
      <IndexPanel v-if="activePanel=='index'" />
    </div>
  </div>
</template>

<script>
import { inject } from "../mixin/vscodeInject";
import IndexPanel from "./IndexPanel";
import ColumnPanel from "./ColumnPanel";
export default {
  mixins: [inject],
  components: { IndexPanel, ColumnPanel },
  data() {
    return {
      table: null,
      dbType: '',
      activePanel: "column",
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.table = data.table;
      this.dbType = data.dbType;
    });
  },
};
</script>

<style scoped>
.tab {
  border-bottom: 1px solid var(--vscode-dropdown-border);
  display: flex;
  padding: 0;
}

.tab__item {
  list-style: none;
  cursor: pointer;
  font-size: var(--vscode-font-size);
  padding: 7px 10px;
  color: var(--vscode-foreground);
  border-bottom: 1px solid transparent;
}

.tab__item:hover {
  color: var(--vscode-panelTitle-activeForeground);
}

.tab__item--active {
  color: var(--vscode-panelTitle-activeForeground);
  border-bottom-color: var(--vscode-panelTitle-activeForeground);
}

</style>
