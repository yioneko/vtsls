import * as vscode from "vscode";

export class Memento implements vscode.Memento {
  protected _storage: any = {};

  keys(): readonly string[] {
    return Object.keys(this._storage);
  }
  get<T>(key: string): T;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T {
    return this._storage[key] ?? defaultValue;
  }
  update(key: string, value: any): Thenable<void> {
    this._storage[key] = value;
    return Promise.resolve();
  }

  setKeysForSync(_: string[]) {
    throw new Error("not implmented");
  }
}
