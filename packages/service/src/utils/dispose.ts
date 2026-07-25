import { Disposable, IDisposable } from "@vsc-ts/utils/dispose";

export * from "@vsc-ts/utils/dispose";

export class MutableDisposable<T extends IDisposable> extends Disposable {
  private _value?: T;

  get value(): T | undefined {
    return this.isDisposed ? undefined : this._value;
  }

  set value(value: T | undefined) {
    if (this.isDisposed || value === this._value) {
      return;
    }

    this._value?.dispose();
    this._value = value;
  }

  clear(): void {
    this.value = undefined;
  }

  override dispose(): void {
    super.dispose();
    this._value?.dispose();
    this._value = undefined;
  }
}
