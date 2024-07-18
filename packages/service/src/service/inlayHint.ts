import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { ConfigurationShimService } from "../shims/configuration";
import { LanguageFeatureRegistryHandle } from "../shims/languageFeatures";
import { TSLspConverter } from "../utils/converter";
import { isNil } from "../utils/types";

export class TSInlayHintFeature {
  constructor(
    private registry: LanguageFeatureRegistryHandle<vscode.InlayHintsProvider, unknown>,
    private configuration: ConfigurationShimService,
    private converter: TSLspConverter
  ) {}

  async inlayHint(
    doc: vscode.TextDocument,
    params: Omit<lsp.InlayHintParams, "textDocument">,
    token: lsp.CancellationToken
  ) {
    const maxHintLength = this.configuration
      .getConfiguration("vtsls.experimental")
      .get<number | null>("maxInlayHintLength");

    const { provider } = this.registry.getHighestProvider(doc);
    const result = await provider.provideInlayHints(
      doc,
      this.converter.convertRangeFromLsp(params.range),
      token
    );

    if (!result) {
      return;
    }

    let converted = result.map(this.converter.convertInlayHint);
    if (!isNil(maxHintLength)) {
      const ellipsis = "…";
      converted = converted.map((hint) => {
        const originalLabel = hint.label;
        const { truncated, label } = truncateLabel(
          originalLabel,
          Math.max(maxHintLength, ellipsis.length),
          ellipsis
        );
        if (truncated) {
          hint.label = label;
          // set original label in data if truncated
          hint.data = { originalLabel };
        }
        return hint;
      });
    }

    return converted;
  }
}

function truncateLabel(label: lsp.InlayHint["label"], limit: number, ellipsis: string) {
  if (typeof label == "string") {
    if (label.length <= limit) {
      return { truncated: false, label };
    } else {
      return {
        truncated: true,
        label: `${label.substring(0, limit - ellipsis.length)}${ellipsis}`,
      };
    }
  }
  const withInLimit =
    label.reduce((labelLength, part) => labelLength + part.value.length, 0) <= limit;
  if (withInLimit) {
    return { truncated: false, label };
  }
  let labelRemaining = limit - ellipsis.length;
  const labelParts: lsp.InlayHintLabelPart[] = [];
  for (const part of label) {
    if (part.value.length < labelRemaining) {
      labelParts.push(part);
      labelRemaining -= part.value.length;
    } else {
      labelParts.push({
        ...part,
        value: `${part.value.substring(0, labelRemaining)}${ellipsis}`,
      });
      break;
    }
  }
  return { truncated: true, label: labelParts };
}
