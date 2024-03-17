# vtsls

This is an LSP wrapper around [TypeScript extension bundled with VSCode](https://github.com/microsoft/vscode/tree/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features). All features and performance are nearly the same.

Unlike other similar projects, this is implemented by filling VSCode APIs and applying **minimal patches** onto the extension to make it possible to **keep up with the upstream updates** and drastically reduce the burden of maintenance.

**Notice:** Though the server is suitable for regular use scenarios at the current stage, there is no absolute guarantee for its robustness as the behavior of the wrapped VSCode extension doesn't always keep 100% clear to me. Users can view this server as a best-effort product but possbily not as reliable as other functionally identical alternatives.

## Usage

Install by `npm install -g @vtsls/language-server`, then run `vtsls --stdio`. Requires `node >= 16`.

## TypeScript version

Similar to VSCode, the server is bundled with the latest TypeScript and the bundled version is used by default. To switch to the workspace version, use command `typescript.selectTypeScriptVersion` or set configuration option `vtsls.autoUseWorkspaceTsdk` to `true`. To ignore the bundled version set configuration option `vtsls.typescript.globalTsdk` to the alternative path.

## LSP Features

See [available server capabilities](./packages/server/src/capabilities.ts). Here are also [references from VSCode](https://code.visualstudio.com/docs/typescript/typescript-editing).

### Code Lens

The code lens command `editor.action.showReferences` should be executed by client, [relevant LSP issue here](https://github.com/microsoft/language-server-protocol/issues/1148). Command arguments:

```
[uri: DocumentUri, codeLensStart: Position, locations: Location[]]
```

### Commands

Some other commands are undocumented because either it is private for server or not tested.

`command`: `(arguments => result)`

- `typescript.openTsServerLog`
- `typescript.restartTsServer`
- `typescript.reloadProjects`
- `javascript.reloadProjects`
- `typescript.selectTypeScriptVersion`
- `typescript.goToSourceDefinition`: `[DocumentUri, Position] => Location[]`
- `typescript.findAllFileReferences`: `[DocumentUri] => Location[]`
- `typescript.goToProjectConfig`: `[DocumentUri] => null`
- `javascript.goToProjectConfig`: `[DocumentUri] => null`
- `_typescript.configurePlugin`: `[pluginName: string, config: any] => any`
- `typescript.tsserverRequest`: `[RequestType, args: any, config: any] => any`

  See [CommandTypes](https://github.com/microsoft/TypeScript/blob/ed15865eb065006da26a233d07c7899103b67c08/src/server/protocol.ts) for available tsserver commands.

- `typescript.organizeImports`: `[filePath: string] => any`
- `typescript.sortImports`: `[filePath: string] => any`
- `javascript.sortImports`: `[filePath: string] => any`
- `typescript.removeUnusedImports`: `[filePath: string] => any`
- `javascript.removeUnusedImports`: `[filePath: string] => any`

### Code Actions

Same as VSCode. The list below may be outdated.

#### Source Actions

- `source.organizeImports`
- `source.sortImports`
- `source.removeUnusedImports`
- `source.fixAll.ts`
- `source.removeUnused.ts`
- `source.addMissingImports.ts`

#### Refactor

- `refactor.extract.function`
- `refactor.extract.constant`
- `refactor.extract.type`
- `refactor.extract.interface`
- `refactor.move.newFile`
- `refactor.move.file`
- `refactor.rewrite.import`
- `refactor.rewrite.export`
- `refactor.rewrite.arrow.braces`
- `refactor.rewrite.property.generateAccessors`

Inline refactor action can carry an additional `editor.action.rename` command for immediate renaming of new extracted symbol. The command should be executed on the client side. Command arguments:

```
[uri: DocumentUri, position: Position][]
```

##### Move to file refactor

This action is disabled by default because its correct functioning requires special handling on the client side. Set `vtsls.enableMoveToFileCodeAction` to `true` to let the server expose this code action with a `_typescript.moveToFileRefactoring` command. Command arguments:


```
[action: any, uri: DocumentUri, range: Range]
```

On the client side, the client should firstly ask user to select a target move file, and append the path of file to the command arguments:


```
[action: any, uri: DocumentUri, range: Range, targetFile: string]
```

Then send the `workspace/executeCommand` request to server with the original command while the command arguments is modified as above.

### Update paths on rename

Require client to send [`workspace/didRenameFiles`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didRenameFiles) notification on rename of file/folder.

## Configuration

Almost the same as the original VSCode extension, with a few additional settings excluded for this server (prefixed with `vtsls.`).

See the configuration schema [here](./packages/service/configuration.schema.json).

## Troubleshooting

Please see [Known issues](https://github.com/yioneko/vtsls/issues/26) first.

### Bad performance of completion

`tsserver` could throw out plenty of completion entries, most of them are globally accessible variables, modules or namespaces. Some LSP clients have poor performance for fuzzy matching or filtering, and cause noticeable delay of completion.

Instead of switching client, some server configuration options could also make partial optimizations:

- `vtsls.experimental.completion.enableServerSideFuzzyMatch`: before returning all the completion candidates from `tsserver`, the server will do fuzzy matching and filter out entries with no match. This can reduce the number of invalid entries in the response.
- `vtsls.experimental.completion.entriesLimit`: set the maximum number of completion entries to return.
- `typescript.preferences.includePackageJsonAutoImports = 'off'`
- `typescript.preferences.autoImportFileExcludePatterns`

### TypeScript plugin not activated

- Plugin should be specified in `tsconfig.json`.
- Check the place of running tsserver. By default the bundled version is used as in VSCode. Switch to workspace version by command `typescript.selectTypeScriptVersion` or config option `vtsls.autoUseWorkspaceTsdk`.
- `typescript.tsserver.pluginPaths`: use this option without modifying `tsconfig.json`.

### Log

- Set `typescript.tsserver.log` in configuration
- Execute command `typescript.openTsServerLog`

## Editor Integration

Neovim | [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig/blob/master/doc/server_configurations.md#vtsls) [nvim-vtsls](https://github.com/yioneko/nvim-vtsls)

## Not Planned

Some not editor-agnostic features in VSCode:

- Read TypeScript plugin from VSCode extensions
- Running in browser, the server only targets on Node environment
- Copilot integration namely AI code actions in VSCode

Plus any features not supported in VSCode.

## Develop

### Build

```sh
git submodule update --init
pnpm install
pnpm build # or pnpm build:watch
```

The server executable is at [packages/server/bin](https://github.com/yioneko/vtsls/blob/main/packages/server/bin/vtsls.js). To test it globally, run `cd packages/server && sudo npm install -g .`, then `vtsls` should be available in `$PATH`.

## Similar Projects

- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- [coc-tsserver](https://github.com/neoclide/coc-tsserver)
