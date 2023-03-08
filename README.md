# vtsls

**Notice:** The server has not been well tested, use it at your own risk. Feedback welcome.

This is an LSP wrapper around [TypeScript extension bundled with VSCode](https://github.com/microsoft/vscode/tree/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features). All features and performance are nearly the same.

Unlike other similar projects, this is implemented by filling VSCode APIs and applying **minimal patches** onto the extension to make it possible to **keep up with the upstream updates** and drastically reduce the burden of maintenance.

## Usage

Install by `npm install -g @vtsls/language-server`, then run `vtsls --stdio`. Requires `node >= 14`.

## LSP Features

See [available server capabilities](./packages/server/src/capabilities.ts).

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
- `typescript.selectTypeScriptVersion`
- `typescript.goToSourceDefinition`: `[DocumentUri, Position] => Location[]`
- `typescript.findAllFileReferences`: `[DocumentUri] => Location[]`
- `typescript.goToProjectConfig`: `[DocumentUri] => null`
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
- `refactor.rewrite.import`
- `refactor.rewrite.export`
- `refactor.rewrite.arrow.braces`
- `refactor.rewrite.property.generateAccessors`

### Update paths on rename

Require client to send [`workspace/didRenameFiles`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didRenameFiles) notification on rename of file/folder.

## Configuration

Almost the same as the original VSCode extension, with a few additional settings excluded for this server.

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

## Not Planned

- Read TypeScript plugin from VSCode extensions
- Web server
- All the features not supported in upstream

## Develop

### Build

```sh
git submodule update --init
pnpm install
pnpm build
pnpm build:watch # or watch changes by
```

## Similar Projects

- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- [coc-tsserver](https://github.com/neoclide/coc-tsserver)
