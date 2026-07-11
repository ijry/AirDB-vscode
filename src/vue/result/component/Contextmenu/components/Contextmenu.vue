<template>
  <Submenu
    :items="items"
    :position="{ x: position.x, y: position.y, width: 0, height: 0 }"
    :style-config="style"
    :custom-class="customClass"
    :common-class="{
      menu: $style.menu,
      menuItem: $style.menu_item,
      clickableMenuItem: $style.menu_item__clickable,
      unclickableMenuItem: $style.menu_item__unclickable
    }"
    @close="$emit('close')"
  />
</template>

<script>
import Submenu from './Submenu.vue';
import { getElementsByClassName } from '../util';

export default {
  props: {
    items: { type: Array, default: () => [] },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    customClass: { type: String, default: null },
    minWidth: { type: Number, default: 150 },
    zIndex: { type: Number, default: 2 }
  },
  emits: ['close'],
  data() {
    return {
      position: { x: this.x, y: this.y },
      style: { zIndex: this.zIndex, minWidth: this.minWidth },
      mouseListening: false
    };
  },
  mounted() {
    this.addListener();
  },
  beforeUnmount() {
    this.removeListener();
  },
  methods: {
    mouseClickListener(e) {
      let el = e.target;
      const menus = getElementsByClassName(this.$style.menu);
      const menuItems = getElementsByClassName(this.$style.menu_item);
      const unclickableMenuItems = getElementsByClassName(
        this.$style.menu_item__unclickable
      );
      while (
        !menus.find(m => m === el) &&
        !menuItems.find(m => m === el) &&
        el.parentElement
      ) {
        el = el.parentElement;
      }
      if (menuItems.find(m => m === el)) {
        if (e.button !== 0 || unclickableMenuItems.find(m => m === el)) {
          return;
        }
        this.$emit('close');
        return;
      }
      if (!menus.find(m => m === el)) {
        this.$emit('close');
      }
    },
    addListener() {
      if (!this.mouseListening) {
        document.addEventListener('click', this.mouseClickListener);
        this.mouseListening = true;
      }
    },
    removeListener() {
      if (this.mouseListening) {
        document.removeEventListener('click', this.mouseClickListener);
        this.mouseListening = false;
      }
    }
  },
  components: { Submenu }
};
</script>

<style module>
.menu,
.menu_item,
.menu_item__clickable,
.menu_item__unclickable {
  box-sizing: border-box;
}
</style>
