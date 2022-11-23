# vtsls

**Notice:** The server has not been well tested, use it at your own risk. Feedback welcome.

This is an LSP wrapper around [TypeScript extension bundled with VSCode](https://github.com/microsoft/vscode/tree/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features). All features and performance are nearly the same.

## Usage

Install by `npm install -g vtsls`, then run `vtsls --stdio`.

## Supported LSP Features

See [available server capabilities](./src/utils/capabilities.ts).

## Commands

### Just works

- `typescript.goToProjectConfig`
- `typescript.openTsServerLog`
- `typescript.restartTsServer`
- `typescript.reloadProjects`
- `typescript.selectTypeScriptVersion`

### Special

- Go to source definition

```typescript
{ command: "typescript.goToSourceDefinition", arguments: [DocumentUri, Position] }

=> Location[]
```

- File references

```typescript
{ command: "typescript.findAllFileReferences", arguments: [DocumentUri] }

=> Location[]
```

- Update paths on rename

  Should work if client is capable of sending [`workspace/didRenameFiles`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didRenameFiles) notification. No special handling is needed on client side.

## Configuration

Almost the same as [TypeScript extension of VSCode](https://github.com/microsoft/vscode/blob/838b48504cd9a2338e2ca9e854da9cec990c4d57/extensions/typescript-language-features/package.json#L147), with a few additional settings excluded for this server.

`* => javascript|typescript`

- `vtsls.*.format.baseIndentSize`
- `vtsls.*.format.indentSize`
- `vtsls.*.format.tabSize`
- `vtsls.*.format.newLineCharacter`
- `vtsls.*.format.convertTabsToSpaces`
- `vtsls.*.format.indentStyle`
- `vtsls.*.format.trimTrailingWhitespace`
- `vtsls.*.wordPattern`

## Code Actions

Same as VSCode. The list below may not be complete.

- `typescript.organizeImports`
- `typescript.sortImports`
- `javascript.sortImports`
- `typescript.removeUnusedImports`
- `javascript.removeUnusedImports`

## TODO

- E2E test
- Diagnostics polling

## Not Planned

- Read TypeScript plugin from VSCode extensions

## Similar Projects

- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- [coc-tsserver](https://github.com/neoclide/coc-tsserver)
