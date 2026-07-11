<template>
  <div>
    <blockquote class="panel" id="error" v-if="error">
      <p class="panel__text">
        Connection error! <span id="errorMessage" v-text="errorMessage"></span><br />
      </p>
    </blockquote>
    <el-table :data="forwardList" style="width: 100%">
      <el-table-column prop="name" label="name">
      </el-table-column>
      <el-table-column prop="localHost" label="Local Host">
      </el-table-column>
      <el-table-column prop="localPort" label="Local Port">
      </el-table-column>
      <el-table-column prop="remoteHost" label="Remote Host">
      </el-table-column>
      <el-table-column prop="remotePort" label="Remote Port">
      </el-table-column>
      <el-table-column prop="state" label="State">
        <template #default="scope">
          {{scope.row.state==true?"running":"stop"}}
        </template>
      </el-table-column>
      <el-table-column fixed="right" width="200">
        <template #header>
          <el-button type="info" size="small" circle @click="createRequest">
            <el-icon><CirclePlus /></el-icon>
          </el-button>
          <el-button type="primary" size="small" circle @click="load">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </template>
        <template #default="scope">
          <el-button v-if="!scope.row.state" @click="start(scope.row.id);" type="success" size="small" title="Start" circle>
            <el-icon><VideoPlay /></el-icon>
          </el-button>
          <el-button v-if="scope.row.state" @click="stop(scope.row.id);" type="danger" size="small" title="Stop" circle>
            <el-icon><SwitchButton /></el-icon>
          </el-button>
          <el-button @click="openEdit(scope.row);" type="primary" size="small" title="Edit" circle>
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button @click="info(scope.row);" type="info" size="small" title="Show command" circle>
            <el-icon><InfoFilled /></el-icon>
          </el-button>
          <el-button @click="deleteConfirm(scope.row.id)" title="delete" type="danger" size="small" circle>
            <el-icon><Delete /></el-icon>
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog ref="editDialog" :title="panel.title" v-model="panel.visible" width="90%" top="3vh">
      <el-form ref="infoForm" :model="panel.edit" label-width="120px">
        <el-form-item size="small" label="name">
          <el-input v-model="panel.edit.name"></el-input>
        </el-form-item>
        <el-form-item size="small" label="localHost">
          <el-input v-model="panel.edit.localHost"></el-input>
        </el-form-item>
        <el-form-item size="small" label="localPort">
          <el-input v-model="panel.edit.localPort"></el-input>
        </el-form-item>
        <el-form-item size="small" label="remoteHost">
          <el-input v-model="panel.edit.remoteHost"></el-input>
        </el-form-item>
        <el-form-item size="small" label="remotePort">
          <el-input v-model="panel.edit.remotePort"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="panel.visible = false">Cancel</el-button>
          <el-button type="primary" :loading="panel.loading" @click="confirmUpdate">
            {{panel.edit.id!=null?"Update":"Create"}}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { CirclePlus, Delete, Edit, InfoFilled, Refresh, SwitchButton, VideoPlay } from "@element-plus/icons-vue";
  import { inject } from "../mixin/vscodeInject";
  export default {
    mixins: [inject],
    components: { CirclePlus, Delete, Edit, InfoFilled, Refresh, SwitchButton, VideoPlay },
    data() {
      return {
        title: "",
        config: {},
        forwardList: [],
        error: false,
        errorMessage: "",
        panel: {
          title: "create foward",
          visible: false,
          loading: false,
          edit: {}
        }
      };
    },
    mounted() {
      this.on("forwardList", content => {
        this.forwardList = content;
        this.panel.loading = false;
        this.panel.visible = false;
      }).on("config", content => {
        this.title = content.host;
        this.config = content;
      }).on("success", (content) => {
        this.error = false;
        this.emit("load")
      }).on("error", content => {
        this.error = true;
        this.errorMessage = content;
      }).init()
    },
    methods: {
      createRequest() {
        this.panel.edit = {
          localHost: "127.0.0.1",
          remoteHost: "127.0.0.1"
        };
        this.panel.visible = true;
      },
      load() {
        this.emit("load")
      },
      confirmUpdate() {
        this.emit("update",this.panel.edit)
        this.panel.loading = true;
      },
      info(row) {
        this.emit("cmd",`ssh  -qTnN -L ${row.localHost}:${row.localPort}:${row.remoteHost}:${row.remotePort} ${this.config.username}@${this.config.host}`)
      },
      start(id) {
        this.emit("start", id)
      },
      stop(id) {
        this.emit("stop", id)
      },
      remove(id) {
        this.emit("remove", id)
      },
      openEdit(row) {
        this.panel.edit = row;
        this.panel.visible = true;
      },
      deleteConfirm(id) {
        this.$confirm(
          "Are you sure you want to delete this forward?",
          "Warning",
          {
            confirmButtonText: "OK",
            cancelButtonText: "Cancel",
            type: "warning"
          }
        )
          .then(() => {
            this.remove(id);
          })
          .catch(() => {
            this.$message({ type: "info", message: "Delete canceled" });
          });
      }
    }
  };
</script>
