# vtsls

**Notice:** The server has not been well tested, use it at your own risk. Feedback welcome.

This is an LSP wrapper around [TypeScript extension bundled with VSCode](https://github.com/microsoft/vscode/tree/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features). All features and performance are nearly the same.

Unlike other similar projects, this is implemented by filling VSCode APIs and applying **minimal patches** onto the extension to make it possible to **keep up with the upstream updates** and drastically reduce the burden of maintenance.

## Usage

Install by `npm install -g @vtsls/language-server`, then run `vtsls --stdio`. Requires `node >= 14`.

## Supported LSP Features

See [available server capabilities](./packages/server/src/capabilities.ts).

### Code Lens

The code lens command `editor.action.showReferences` shoule be executed by client, [relevant LSP issue here](https://github.com/microsoft/language-server-protocol/issues/1148). Command arguments:

```typescript
[uri: DocumentUri, codeLensStart: Position, locations: Location[]]
```

## Configuration

Almost the same as the original VSCode extension, with a few additional settings excluded for this server.

See the configuration schema [here](./packages/service/configuration.schema.json).

## Commands

### Just works

- `typescript.openTsServerLog`
- `typescript.restartTsServer`
- `typescript.reloadProjects`
- `typescript.selectTypeScriptVersion`

### Special

- Go to source definition

```typescript
{
  command: "typescript.goToSourceDefinition",
  arguments: [DocumentUri, Position]
} => Location[]
```

- File references

```typescript
{
  command: "typescript.findAllFileReferences",
  arguments: [DocumentUri],
} => Location[]
```

- Go to project config

```typescript
{
  command: "typescript.goToProjectConfig",
  arguments: [DocumentUri],
} => void
```

- Update paths on rename

  Should work if client is capable of sending [`workspace/didRenameFiles`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didRenameFiles) notification on file rename. No special handling is needed on client side.

- Directly invoke tsserver command

  See [CommandTypes](https://github.com/microsoft/TypeScript/blob/f6628a4573cd37c26912f78de3d08cd1dbf687a5/lib/protocol.d.ts) for available commands.

```typescript
{
  command: "typescript.tsserverRequest",
  arguments: [RequestType, args, config]
} => Response
```

- Configure typescript plugin

```typescript
{
  command: "_typescript.configurePlugin",
  arguments: [pluginName, config]
} => Response
```

## Code Actions

Same as VSCode. The list below may not be complete.

### Quickfix

- `typescript.organizeImports`
- `typescript.sortImports`
- `javascript.sortImports`
- `typescript.removeUnusedImports`
- `javascript.removeUnusedImports`

### Source Actions

- `source.organizeImports`
- `source.sortImports`
- `source.removeUnusedImports`
- `source.fixAll.ts`
- `source.removeUnused.ts`
- `source.addMissingImports.ts`

### Refactor

- `refactor.extract.function`
- `refactor.extract.constant`
- `refactor.extract.type`
- `refactor.extract.interface`
- `refactor.move.newFile`
- `refactor.rewrite.import`
- `refactor.rewrite.export`
- `refactor.rewrite.arrow.braces`
- `refactor.rewrite.property.generateAccessors`

## Known Issues

See [Known issues](https://github.com/yioneko/vtsls/issues/26)

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
