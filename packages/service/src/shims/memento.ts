import type * as vscode from "vscode";

export class Memento implements vscode.Memento {
  protected _storage: any = {};

  keys(): readonly string[] {
    return Object.keys(this._storage);
  }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T) {
    return (this._storage[key] as T) ?? defaultValue;
  }
  update(key: string, value: any): Thenable<void> {
    this._storage[key] = value;
    return Promise.resolve();
  }

  setKeysForSync() {
    throw new Error("not implmented");
  }
}
