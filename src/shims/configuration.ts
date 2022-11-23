import * as fs from "fs/promises";
import * as path from "path";
import { EditorSettings } from "typescript/lib/tsserverlibrary";
import * as vscode from "vscode";
import { Emitter } from "vscode-languageserver";
import { isTypeScriptDocument } from "@vsc-ts/utils/languageIds";
import { ITsLspServerHandle } from "../server";

function lookUp(tree: any, key: string | undefined) {
  if (key) {
    const parts = key.split(".");
    let node = tree;
    for (let i = 0; node && i < parts.length; i++) {
      node = node[parts[i]];
    }
    return node;
  }
  return tree;
}

function update<T = any>(tree: any, key: string, val: T) {
  const parts = key.split(".");
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]]) {
      node[parts[i]] = {};
    }
    node = node[parts[i]];
  }
  if (node && parts.length) {
    node[parts[parts.length - 1]] = val;
  }
}

function recursiveUpdate(cur: any, value: any) {
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
  return cur;
}

export interface VtslsConfig {
  format?: EditorSettings;
  wordPattern?: string;
}

export class ConfigurationShimService {
  private defaultConfig: any = {};
  private workspaceConfig: any = {};

  private _onDidChangeConfiguration =
    new Emitter<vscode.ConfigurationChangeEvent>();
  readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

  private pkgJsonRead: Promise<any>;

  constructor(assetsRoot: string) {
    this.pkgJsonRead = fs
      .readFile(path.resolve(assetsRoot, "package.json"), "utf8")
      .then(JSON.parse);
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

  $injectServerHandle(server: ITsLspServerHandle) {
    server.registerInitRequestHandler(async () => {
      const pkgJson = await this.pkgJsonRead;
      const contributed = pkgJson?.contributes?.configuration?.properties || {};
      for (const [key, val] of Object.entries<any>(contributed)) {
        let defaultVal = val.default;
        if (!defaultVal) {
          if (val.type === "string") {
            defaultVal = "";
          } else if (val.type === "array") {
            defaultVal = [];
          }
        }
        update(this.defaultConfig, key, defaultVal);
      }
    });

    server.onDidChangeConfiguration(({ settings }) => {
      recursiveUpdate(this.workspaceConfig, settings);
    });
  }

  $getVtslsDocConfig(doc: vscode.TextDocument, section?: string) {
    const languageId = isTypeScriptDocument(doc) ? "typescript" : "javascript";
    return this.getConfiguration(
      `vtsls.${languageId}` + section ? `.${section}` : ""
    );
  }
}
