import { Disposable } from "vscode-languageserver-protocol";

export class RestrictedCache<V> implements Disposable {
  private readonly _store = new Map<number, V>();
  private _isDisposed = false;

  private maxId = 1;
  private lastMinId = 0;

  constructor(private readonly maxItems: number) {}

  dispose(): void {
    this._isDisposed = true;
    if (!this._store.size) {
      return;
    }
    this._store.clear();
  }

  has(key: number): boolean {
    return this._store.has(key);
  }

  get(key: number): V | undefined {
    return this._store.get(key);
  }

  store(value: V): number {
    const cacheId = this.maxId++;
    this._store.set(cacheId, value);
    this._clearIfMaxReached();
    return cacheId;
  }

  delete(key: number): void {
    this._store.delete(key);
  }

  private timer: NodeJS.Timeout | undefined;

  _clearIfMaxReached() {
    if (!!this.timer || this._store.size < this.maxItems) {
      return;
    }
    this.timer = setTimeout(() => {
      while (this._store.size > this.maxItems && this.lastMinId < this.maxId) {
        this.lastMinId += 1;
        if (this._store.has(this.lastMinId)) {
          this.delete(this.lastMinId);
        }
      }

      this.timer = undefined;
    }, 100);
  }
}
