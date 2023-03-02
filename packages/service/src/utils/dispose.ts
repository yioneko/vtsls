import { IDisposable } from "@vsc-ts/utils/dispose";

export * from "@vsc-ts/utils/dispose";

export class DisposableStore implements IDisposable {
  static DISABLE_DISPOSED_WARNING = false;

  private readonly _toDispose = new Set<IDisposable>();
  private _isDisposed = false;

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;
    this.clear();
  }

  public get isDisposed(): boolean {
    return this._isDisposed;
  }

  public clear(): void {
    if (this._toDispose.size === 0) {
      return;
    }

    try {
      this._toDispose.forEach((d) => d.dispose());
    } finally {
      this._toDispose.clear();
    }
  }

  public add<T extends IDisposable>(o: T): T {
    if (!o) {
      return o;
    }
    if ((o as unknown as DisposableStore) === this) {
      throw new Error("Cannot register a disposable on itself!");
    }

    if (this._isDisposed) {
      if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
        console.warn(
          new Error(
            "Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!"
          ).stack
        );
      }
    } else {
      this._toDispose.add(o);
    }

    return o;
  }
}
