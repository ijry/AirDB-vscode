const vscode = typeof (acquireVsCodeApi) != "undefined" ? acquireVsCodeApi() : null;
const postMessage = (message) => { if (vscode) { vscode.postMessage(message) } }

export const getVscodeEvent = () => {
    let events = {}
    let init = false;
    function receive({ data }) {
        if (!data)
            return;
        if (events[data.type]) {
            events[data.type](data.content);
        }
    }
    return {
        on(event, callback) {
            this.tryInit();
            events[event] = callback
            return this;
        },
        emit(event, data) {
            this.tryInit();
            // 发送消息给vscode
            postMessage({ type: event, content: data })
        },
        tryInit() {
            if (init) return;
            init = true;
            // 接收vscode发送的消息
            window.addEventListener('message', receive)
        },
        destroy() {
            window.removeEventListener('message', receive)
            this.init = false;
        }
    }
}

