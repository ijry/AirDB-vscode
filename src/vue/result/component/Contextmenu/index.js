import { createApp, h } from 'vue';
import Contextmenu from './components/Contextmenu';
import Submenu from './components/Submenu';
import { COMPONENT_NAME } from './constant';

function mountContextmenu(options, onUnmount) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  let mounted = true;
  const app = createApp({
    render() {
      return h(Contextmenu, {
        items: options.items || [],
        x: options.event ? options.event.clientX : options.x || 0,
        y: options.event ? options.event.clientY : options.y || 0,
        customClass: options.customClass || null,
        minWidth: options.minWidth,
        zIndex: options.zIndex,
        onClose: close
      });
    }
  });

  function close() {
    if (!mounted) {
      return;
    }
    mounted = false;
    app.unmount();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (typeof onUnmount === 'function') {
      onUnmount();
    }
  }

  app.component(COMPONENT_NAME, Submenu);
  app.mount(container);
  return { close };
}

function install(app) {
  let lastContextmenu = null;
  const ContextmenuProxy = function (options) {
    ContextmenuProxy.destroy();
    lastContextmenu = mountContextmenu(options || {}, () => {
      lastContextmenu = null;
    });
  };

  ContextmenuProxy.destroy = function () {
    if (lastContextmenu) {
      lastContextmenu.close();
      lastContextmenu = null;
    }
  };

  app.config.globalProperties.$contextmenu = ContextmenuProxy;
}

export default { install };
