# vtsls

**Notice:** The server has not been well tested, use it at your own risk. Feedback welcome.

This is an LSP wrapper around [TypeScript extension bundled with VSCode](https://github.com/microsoft/vscode/tree/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features). All features and performance are nearly the same.

## Usage

Install by `npm install -g vtsls`, then run `vtsls --stdio`.

## Supported LSP Features

See [available server capabilities](./src/utils/capabilities.ts).

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
  command: "typescript.findAllFileReferences",
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

## Configuration

Almost the same as [TypeScript extension of VSCode](https://github.com/microsoft/vscode/blob/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features/package.json#L147), with a few additional settings excluded for this server.

`* => javascript|typescript`

```typescript
"vtsls.*.format.baseIndentSize": number;
"vtsls.*.format.indentSize": number;
"vtsls.*.format.tabSize": number;
"vtsls.*.format.newLineCharacter": string;
"vtsls.*.format.convertTabsToSpaces": boolean;
"vtsls.*.format.indentStyle": 0 | 1 | 2; // None = 0 Block = 1 Smart = 2
"vtsls.*.format.trimTrailingWhitespace": boolean;
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

## TODO

- E2E test
- Diagnostics polling

## Not Planned

- Read TypeScript plugin from VSCode extensions

## Similar Projects

- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- [coc-tsserver](https://github.com/neoclide/coc-tsserver)
