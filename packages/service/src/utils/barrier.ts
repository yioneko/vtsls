export class Barrier<V = void> {
  private _isOpen: boolean;
  private _promise: Promise<V>;
  private _completePromise!: (v: V) => void;

  constructor() {
    this._isOpen = false;
    this._promise = new Promise<V>((v) => {
      this._completePromise = v;
    });
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  open(value?: V): void {
    this._isOpen = true;
    this._completePromise(value as V);
  }

  wait(): Promise<V> {
    return this._promise;
  }
}
