import type * as vscode from "vscode";
import { Emitter } from "vscode-languageserver-protocol";
import { Disposable } from "../utils/dispose";
import { deepClone } from "../utils/objects";
import { isPrimitive } from "../utils/types";

function lookUp<T>(tree: any, key: string | undefined): T | undefined {
  if (key) {
    const parts = key.split(".");
    let node = tree;
    for (let i = 0; node && !isPrimitive(node) && i < parts.length; i++) {
      node = node[parts[i]];
    }
    return node as T | undefined;
  }
  return tree as T;
}

function update<T = any>(tree: any, key: string, val: T) {
  const parts = key.split(".");
  let node = tree;
  for (let i = 0; node && !isPrimitive(node) && i < parts.length - 1; i++) {
    if (!node[parts[i]]) {
      node[parts[i]] = {};
    }
    node = node[parts[i]];
  }
  if (node && !isPrimitive(node) && parts.length) {
    node[parts[parts.length - 1]] = val;
  }
}

function recursiveUpdate<T>(cur: any, value: T): T {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    return value;
  }
  for (const [k, v] of Object.entries(value)) {
    if (!cur[k]) {
      cur[k] = v;
    } else {
      cur[k] = recursiveUpdate(cur[k], v);
    }
  }
  return cur as T;
}

export class ConfigurationShimService extends Disposable {
  private defaultConfig: any;
  private workspaceConfig: any = {};

  private _onDidChangeConfiguration = this._register(
    new Emitter<vscode.ConfigurationChangeEvent>()
  );
  readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

  constructor(defaultConfig: any) {
    super();
    this.defaultConfig = deepClone(defaultConfig);
  }

  getConfiguration(section?: string) {
    const provider = this;

    const vscConfig: vscode.WorkspaceConfiguration = {
      has(key: string): boolean {
        key = section ? `${section}.${key}` : key;
        return (
          typeof lookUp(provider.workspaceConfig, key) !== "undefined" ||
          typeof lookUp(provider.defaultConfig, key) !== "undefined"
        );
      },
      get<T>(key: string, defaultValue?: T) {
        key = section ? `${section}.${key}` : key;
        let result: T | undefined = lookUp(provider.workspaceConfig, key);
        if (typeof result === "undefined") {
          result = lookUp(provider.defaultConfig, key);
        }
        if (typeof result === "undefined") {
          return defaultValue;
        }
        return result;
      },
      inspect(key: string) {
        if (this.has(key)) {
          key = section ? `${section}.${key}` : key;
          return {
            key,
            defaultValue: lookUp(provider.defaultConfig, key),
            workspaceValue: lookUp(provider.workspaceConfig, key),
          };
        }
      },
      update<T>(key: string, value: T | undefined): Thenable<void> {
        key = section ? `${section}.${key}` : key;
        update(provider.workspaceConfig, key, value);
        provider._onDidChangeConfiguration.fire({
          affectsConfiguration(sec) {
            return key.startsWith(sec);
          },
        });
        return Promise.resolve();
      },
    };

    return vscConfig;
  }

  $changeConfiguration(config: any) {
    recursiveUpdate(this.workspaceConfig, config);
    this._onDidChangeConfiguration.fire({
      affectsConfiguration(sec) {
        return !!lookUp(config, sec);
      },
    });
  }
}
