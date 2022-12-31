import { TSLanguageServiceDelegate } from "../languageService";
import * as lsp from "vscode-languageserver-protocol";

export interface ICommand {
  id: string;
  callback: (...args: any[]) => any;
  thisArg?: any;
  // description?: ICommandHandlerDescription | null;
}

export class CommandsShimService {
  private readonly _commands = new Map<string, ICommand>();

  private readonly _onDidRegisterCommand = new lsp.Emitter<string>();
  readonly onDidRegisterCommand = this._onDidRegisterCommand.event;

  constructor(private readonly delegate: TSLanguageServiceDelegate) {}

  async getCommands(filterInternal = false): Promise<string[]> {
    const result = [];
    for (const id of this._commands.keys()) {
      if (filterInternal && id[0] !== "_") {
        result.push(id);
      }
    }
    return result;
  }

  registerCommand(id: string, callback: (...args: any[]) => any, thisArg?: any) {
    if (!id.trim().length) {
      throw new Error("invalid id");
    }
    if (this._commands.has(id)) {
      throw new Error(`command '${id}' already exists`);
    }
    this._commands.set(id, { id, callback, thisArg });

    return lsp.Disposable.create(() => {
      this._commands.delete(id);
    });
  }

  async executeCommand<T, A extends any[]>(id: string, ...args: A): Promise<T | undefined> {
    const command = this._commands.get(id);
    if (!command) {
      this.delegate.logMessage(lsp.MessageType.Error, `Command ${id} not found`);
      return;
    }

    const { callback, thisArg } = command;
    try {
      return (await callback.apply(thisArg, args)) as T;
    } catch (e) {
      this.delegate.logMessage(lsp.MessageType.Error, `Execute command ${id} failed: ${String(e)}`);
    }
  }
}
