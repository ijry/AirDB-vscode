# Standalone Tree And Command IPC Design

## Goal

Make the standalone Tauri host interactive enough for AirDB's contributed SQL and NoSQL views to load real tree data and invoke extension commands.

The previous milestone proves that the app can start AirDB through the Node extension host. This milestone adds the missing bidirectional IPC path between the frontend, Rust backend, and extension host.

## Scope

Included:

- Add frontend-to-extension-host request delivery through Tauri commands and the extension-host stdin stream.
- Add extension-host request handling for tree child resolution and command execution.
- Track created VS Code tree views and their `TreeDataProvider` instances in the extension host.
- Serialize VS Code `TreeItem` data into frontend-safe `TreeNode` objects.
- Let the frontend request root tree nodes and expanded child nodes.
- Let the frontend invoke tree item commands and explicit commands by id.
- Add focused tests for protocol routing, tree serialization, command dispatch, and frontend state updates.

Excluded:

- Full VS Code tree parity such as checkboxes, drag/drop, reveal semantics, badges, and complex context menu evaluation.
- Full editor/query execution workflows.
- Dialog completion flows beyond returning current placeholder values.
- Installer sidecar packaging.
- User-installed VSIX support.

## Architecture

The runtime becomes a bidirectional message loop.

1. The Tauri frontend sends a `HostRequest` through a new `sendHostRequest` helper.
2. The helper calls a Rust command named `send_extension_host_message`.
3. Rust writes the serialized JSON line to the extension host child process stdin.
4. The extension host reads stdin with `JsonLineDecoder`, dispatches the request, and writes a `HostResponse` to stdout.
5. Rust forwards stdout JSON lines to the frontend as the existing `extension-host-message` event.
6. The frontend `RequestStore` resolves the original promise and dispatches any resulting workbench state updates.

The existing stdout notification path remains unchanged.

## Protocol

Use the existing message groups:

- `tree.resolveChildren`
- `tree.invokeItemCommand`
- `command.execute`

Request payloads:

```ts
interface ResolveTreeChildrenPayload {
  viewId: string;
  nodeId?: string;
}

interface InvokeTreeItemCommandPayload {
  viewId: string;
  nodeId: string;
}

interface ExecuteCommandPayload {
  command: string;
  arguments?: unknown[];
}
```

`tree.resolveChildren` responds with:

```ts
interface ResolveTreeChildrenResponse {
  viewId: string;
  parentNodeId?: string;
  nodes: TreeNode[];
}
```

`tree.invokeItemCommand` responds with `{ invoked: boolean }`.

`command.execute` responds with the registered command result after JSON-safe conversion. Non-serializable values are returned as `null` and logged.

## Extension Host Changes

Add a `TreeViewRegistry` in `standalone/extension-host` with clear responsibilities:

- Register each tree view created through `window.createTreeView`.
- Store the `TreeDataProvider`.
- Assign stable runtime node ids.
- Map node ids back to provider elements.
- Resolve children by calling `provider.getChildren(element)`.
- Convert each element with `provider.getTreeItem(element)`.
- Serialize supported tree item fields: label, description, tooltip, collapsibleState, contextValue, command, iconPath, and resourceUri.

The VS Code shim must not serialize provider internals into `tree.create` notifications. The `HostBridge` contract should gain a local-only `registerTreeView(viewId, treeOptions, extensionId)` hook implemented by the extension host. That hook stores the provider in `TreeViewRegistry` and then emits a frontend-safe `tree.create` notification containing only JSON-safe metadata such as `viewId` and `extensionId`.

Add an `ExtensionHostController` or equivalent dispatcher that handles incoming `HostRequest` messages:

- For `tree.resolveChildren`, call `TreeViewRegistry.resolveChildren`.
- For `tree.invokeItemCommand`, find the node command and route it through `CommandRegistry.executeCommand`.
- For `command.execute`, call `CommandRegistry.executeCommand`.
- For unsupported request groups, return `createErrorResponse`.

Errors must include the message group and view or command id where available.

## Rust Backend Changes

Extend the spawned extension host process management:

- Keep child stdin in shared state.
- Add `send_extension_host_message(message: String) -> Result<(), String>`.
- Validate that the message parses as JSON before writing it to stdin.
- Append `\n` if the frontend sends a raw JSON string without a newline.
- Return a clear error if the extension host has not started or stdin is closed.

The backend still forwards stdout JSON lines through `extension-host-message`. Non-JSON stdout and stderr stay on `host-log`.

## Frontend Changes

Add request support in `standalone/app/src/bridge/hostBridge.ts`:

- `sendHostRequest<T>(group, payload, extensionId?)`
- Use protocol `createRequest` and `RequestStore`.
- Send the JSON request through Tauri `invoke("send_extension_host_message", { message })`.
- Resolve promises when matching `HostResponse` events arrive.
- Keep notification mapping in `mapHostMessageToActions`.

Tree UI behavior:

- When a `tree.create` notification arrives, register the tree and immediately request root children.
- When a collapsible node is clicked, request children for that node if not already loaded.
- Store `expandedNodeIds` and node `loading` state in the workbench store.
- Clicking a node with a command calls `tree.invokeItemCommand`.

Tree rendering remains simple. It should show labels, descriptions, twisties, loading text, and command click behavior.

## Data Flow

Root loading:

1. AirDB calls `window.createTreeView("activitybar.airdb.sql", { treeDataProvider })`.
2. Extension host registers the provider and sends `tree.create`.
3. Frontend dispatches `tree/register`.
4. Frontend sends `tree.resolveChildren` with no `nodeId`.
5. Extension host calls AirDB provider `getChildren(undefined)`.
6. Extension host serializes returned items and responds.
7. Frontend dispatches `tree/updateChildren`.

Node expansion:

1. User clicks a collapsible node.
2. Frontend toggles expanded/loading state.
3. Frontend sends `tree.resolveChildren` with `nodeId`.
4. Extension host resolves children for the stored provider element.
5. Frontend inserts child nodes under the parent.

Command invocation:

1. User clicks a command node or command action.
2. Frontend sends `tree.invokeItemCommand`.
3. Extension host looks up the node command.
4. Extension host executes the command via `CommandRegistry`.
5. Extension host returns success or an explicit error.

## Error Handling

- Unknown tree view id returns `Tree view not found: <viewId>`.
- Unknown node id returns `Tree node not found: <nodeId>`.
- Missing command returns `Tree node has no command: <nodeId>`.
- Provider exceptions are caught and returned as failed `HostResponse`.
- Frontend request timeouts show a notification with the request group and id.
- Failed tree loads leave the node expanded state unchanged and show a notification.

## Testing

Unit tests:

- `TreeViewRegistry` resolves root and child nodes from a fixture provider.
- Tree item serialization handles string labels, object labels, descriptions, collapsible states, and commands.
- The extension-host dispatcher returns success and error responses.
- Frontend request bridge resolves matching responses and rejects timeouts.
- Workbench reducer inserts child nodes under the correct parent.

Integration smoke:

- Build standalone packages.
- Prepare AirDB extension.
- Start extension host directly.
- Send `tree.resolveChildren` for `activitybar.airdb.sql`.
- Verify a successful response is returned and no unsupported API error is thrown.

Manual smoke:

- Run `npm --prefix standalone run tauri --workspace @airdb-standalone/app -- dev`.
- Confirm AirDB SQL and NoSQL containers appear.
- Confirm both root tree views request children.
- Expand a root item if AirDB has saved connection state.
- Confirm command invocation reaches the extension host without transport errors.

## Risks

- AirDB tree nodes may include non-serializable command arguments. The first version keeps original elements in the extension host and only sends node ids plus JSON-safe display data to the frontend.
- AirDB may return empty roots without saved connections. This is valid; tests should use a fixture provider and manual smoke should check transport success, not require user data.
- Tree refresh events may fire before the frontend has loaded a tree. The reducer must tolerate refresh for unknown trees.
- Bidirectional stdin/stdout IPC can deadlock if stdout is not drained. Rust already drains stdout and stderr on background threads; this design keeps that pattern.

## Success Criteria

- The Tauri frontend can send requests to the extension host and receive responses.
- AirDB tree providers are registered without leaking provider objects into frontend JSON.
- SQL and NoSQL tree roots can be resolved through `tree.resolveChildren`.
- Tree item commands are routed through the existing command registry.
- Tests pass with `npm --prefix standalone run test`, `npm --prefix standalone run build`, and `cargo check`.
- Existing direct AirDB activation and Tauri startup smoke tests still pass.
