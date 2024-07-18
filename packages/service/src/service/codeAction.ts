import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { ConfigurationShimService } from "../shims/configuration";
import { CodeActionRegistryHandle } from "../shims/languageFeatures";
import * as types from "../shims/types";
import { RestrictedCache } from "../utils/cache";
import { TSLspConverter } from "../utils/converter";
import { Disposable } from "../utils/dispose";
import { isNil } from "../utils/types";

function isCodeAction(item: lsp.Command | lsp.CodeAction): item is lsp.CodeAction {
  return typeof item.command != "string";
}

interface CodeActionData {
  providerId: number;
  index: number;
  cacheId: number;
}

export class CodeActionCache extends Disposable {
  private readonly codeActionCache = this._register(
    new RestrictedCache<(vscode.Command | vscode.CodeAction)[]>(12)
  );

  store(items: (vscode.Command | vscode.CodeAction)[], providerId: number) {
    const cacheId = this.codeActionCache.store(items);
    return items.map((_, index) => {
      const data = this.createData(providerId, index, cacheId);
      return { data };
    });
  }

  resolveData(
    data?: any
  ): ({ cachedItem: vscode.Command | vscode.CodeAction } & CodeActionData) | undefined {
    const { providerId: _providerId, index: _index, cacheId: _cacheId } = data || {};
    if ([_providerId, _index, _cacheId].some(isNil)) {
      return;
    }
    const providerId = _providerId as number;
    const index = _index as number;
    const cacheId = _cacheId as number;
    const cachedItem = this.codeActionCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return;
    }
    return { cachedItem, providerId, index, cacheId };
  }

  private createData(providerId: number, index: number, cacheId: number): CodeActionData {
    return {
      providerId,
      index,
      cacheId,
    };
  }
}

export class TSCodeActionFeature extends Disposable {
  private cache: CodeActionCache;

  constructor(
    private registry: CodeActionRegistryHandle,
    private readonly configuration: ConfigurationShimService,
    private converter: TSLspConverter,
    private clientCapabilities: lsp.ClientCapabilities
  ) {
    super();
    this.cache = this._register(new CodeActionCache());
  }

  private get unsupported_actions(): string[] {
    return this.configuration.getConfiguration("vtsls").get<boolean>("enableMoveToFileCodeAction")
      ? []
      : ["refactor.move.file"];
  }

  async codeAction(
    doc: vscode.TextDocument,
    params: Omit<lsp.CodeActionParams, "textDocument">,
    token: lsp.CancellationToken
  ) {
    const providers = this.registry.getProviders(doc);

    const ctx = params.context;
    const baseVscCtx = {
      diagnostics: ctx.diagnostics.map(this.converter.convertDiagnosticFromLsp),
      triggerKind: (ctx.triggerKind ??
        lsp.CodeActionTriggerKind.Invoked) as vscode.CodeActionTriggerKind,
    };

    const results: (lsp.Command | lsp.CodeAction)[][] = [];
    // if no kinds passed, assume requesting all
    const kinds = ctx.only?.sort() ?? [""];

    let lastPrefixi = -1;
    for (let i = 0; i < kinds.length; ++i) {
      const kind = kinds[i];
      // filter out kinds with same prefix
      if (lastPrefixi >= 0 && kind.startsWith(kinds[lastPrefixi])) {
        continue;
      } else {
        lastPrefixi = i;
      }

      // empty kind "" should be assigned as undefined
      const vscKind = kind ? new types.CodeActionKind(kind) : undefined;
      const vscCtx = {
        only: vscKind,
        ...baseVscCtx,
      };

      for (const { id, provider, args } of providers) {
        if (
          vscKind &&
          args.metadata &&
          args.metadata.providedCodeActionKinds?.every((k) => !vscKind.contains(k))
        ) {
          continue;
        }
        let actions = await provider.provideCodeActions(
          doc,
          types.Range.of(params.range),
          vscCtx,
          token
        );
        // filter out disabled actions
        if (!this.clientCapabilities.textDocument?.codeAction?.disabledSupport) {
          actions = actions?.filter((item) => !("disabled" in item && item.disabled));
        }
        actions = actions?.filter(
          (action) =>
            !(
              "kind" in action &&
              action.kind &&
              this.unsupported_actions.includes(action.kind.value)
            )
        );

        if (!actions || actions.length === 0) {
          continue;
        }

        const overrideFields = this.cache.store(actions, id);
        results.push(
          actions.map((action, index) => {
            const converted = this.converter.convertCodeAction(action);
            const { data } = overrideFields[index];
            return isCodeAction(converted) ? { ...converted, data } : converted;
          })
        );
      }
    }

    if (results.length > 0) {
      const flattedResults = results.flat();
      if (this.clientCapabilities.textDocument?.codeAction?.resolveSupport) {
        return flattedResults;
      } else {
        // client has no resolve support
        return await Promise.all(
          flattedResults.map((item) =>
            isCodeAction(item) && !item.disabled
              ? this.codeActionResolve(item, token)
              : Promise.resolve(item)
          )
        );
      }
    } else {
      return null;
    }
  }

  async codeActionResolve(item: lsp.CodeAction, token: lsp.CancellationToken) {
    const cached = this.cache.resolveData(item.data);
    if (!cached) {
      return item;
    }
    const { providerId, cachedItem } = cached;
    const entry = this.registry.getProviderById(providerId);
    if (!entry || !entry.provider.resolveCodeAction) {
      return item;
    }

    const result = await entry.provider.resolveCodeAction(cachedItem as vscode.CodeAction, token);
    if (result) {
      // preserve data and command
      // the codeAction instance is mutated in cache
      const converted = this.converter.convertCodeAction(result, item.data);
      return converted;
    } else {
      return item;
    }
  }
}
