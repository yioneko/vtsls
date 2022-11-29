import { Disposable, Emitter } from "vscode-languageserver/node";

export interface ICommand {
  id: string;
  callback: Function;
  thisArg?: any;
  // TODO: not used
  // description?: ICommandHandlerDescription | null;
}

export class CommandsShimService {
  private readonly _commands = new Map<string, ICommand>();

  private readonly _onDidRegisterCommand = new Emitter<string>();
  readonly onDidRegisterCommand = this._onDidRegisterCommand.event;

  constructor() {}

  async getCommands(filterInternal: boolean = false): Promise<string[]> {
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

    return Disposable.create(() => {
      this._commands.delete(id);
    });
  }

  async executeCommand(id: string, ...args: any[]) {
    const command = this._commands.get(id);
    if (!command) {
      // throw new Error(`Command ${id} not found`);
      return;
    }

    const { callback, thisArg } = command;
    try {
      return await callback.apply(thisArg, args);
    } catch (e) {
      throw new Error(`Execute command ${id} failed: ${e}`);
    }
  }
}
