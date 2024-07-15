# @vtsls/language-service

## Usage example

```typescript
import { createTSLanguageService } from "@vtsls/language-service";
const service = createTSLanguageService({
  clientCapabilities: {},
});

// initialize with configuration
await service.initialize({
  typescript: { tsserver: { log: "verbose" } },
});

const uri = "file:///path/to/file.ts";
// fill file content here
const fileContent = "";

// file needs to be opened before requesting features
service.openTextDocument({
  textDocument: {
    uri,
    languageId: "typescript",
    version: 0,
    text: fileContent,
  },
});

// see LSP document for the format of params and response
const response = await service.documentSymbol({ textDocument: { uri } })
console.log(response);

// close the service
service.dispose();
```

See [@vtsls/language-server](../server/src/index.ts) for more examples.
