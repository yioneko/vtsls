import { Emitter } from "vscode-languageserver";

export class DebounceEmitter<T> extends Emitter<T> {
  private readonly _delay: number;
  private _cancelCount = 0;
  private _eventBuffer: T[] = [];

  constructor(delay?: number) {
    super();
    this._delay = delay ?? 100;
  }

  private addCancel() {
    this._cancelCount++;
  }

  private tryFlush(): void {
    if (this._cancelCount !== 0 && --this._cancelCount === 0) {
      const consumed = this._eventBuffer;
      this._eventBuffer = [];
      for (const event of consumed) {
        super.fire(event);
      }
    }
  }

  override fire(event: T): void {
    this._eventBuffer.push(event);

    this.addCancel();
    setTimeout(() => {
      this.tryFlush();
    }, this._delay);
  }
}
