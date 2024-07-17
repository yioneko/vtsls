import { afterEach, describe, expect, it, vi } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { RegisteredWatcherCollection } from "../src/shims/watcher";

describe("watcher collection", async () => {
  const mockRegister = vi.fn();
  const mockUnregister = vi.fn();
  const registerWatcher = (baseUri: URI, recursive: boolean) => {
    mockRegister(baseUri.path, recursive);
    return {
      dispose: () => {
        mockUnregister(baseUri.path, recursive);
      },
    };
  };

  const fakeEvent = new lsp.Emitter<any>().event;
  const createWatcherArgs = (basePath: string, pattern: string) =>
    [
      {
        baseUri: URI.from({ scheme: "file", path: basePath }),
        pattern,
      },
      fakeEvent,
    ] as const;

  afterEach(() => {
    mockRegister.mockClear();
    mockUnregister.mockClear();
  });

  it("should dedup based on path", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    collection.add(...createWatcherArgs("/a/b", "**"));
    collection.add(...createWatcherArgs("/a/c", "**"));
    collection.add(...createWatcherArgs("/a", "**"));
    expect(mockRegister).toBeCalledWith("/a", true);
    expect(mockUnregister).toBeCalledWith("/a/b", true);
    expect(mockUnregister).toBeCalledWith("/a/c", true);

    mockRegister.mockClear();
    collection.add(...createWatcherArgs("/a", "b"));
    expect(mockRegister).not.toBeCalled();
  });

  it("should unregister watcher if unused", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const watchers = [
      collection.add(...createWatcherArgs("/a", "**")),
      collection.add(...createWatcherArgs("/a", "c")),
    ];

    watchers[0].dispose();
    expect(mockUnregister).not.toBeCalled();

    watchers[1].dispose();
    // only if the two watchers disposed "/a" will be unregistered
    expect(mockUnregister).toBeCalledWith("/a", true);
  });

  it("should correctly handle transferred watcher", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const subWatcher = collection.add(...createWatcherArgs("/a/b", "**"));
    const watcher = collection.add(...createWatcherArgs("/a", "**"));

    // now "/a/b" is transferred to "/a"
    expect(mockUnregister).toBeCalledWith("/a/b", true);
    expect(mockRegister).toBeCalledWith("/a", true);

    mockUnregister.mockClear();
    watcher.dispose();
    expect(mockUnregister).not.toBeCalled();

    subWatcher.dispose();
    // only if the transferred watcher is also disposed "/a" will be unregistered
    expect(mockUnregister).toBeCalledWith("/a", true);
  });

  it("should handle non-recursive watchers", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const watchers = [
      collection.add(...createWatcherArgs("/a", "*")),
      collection.add(...createWatcherArgs("/a/b", "*")),
    ];
    expect(mockRegister).toBeCalledTimes(2);
    mockRegister.mockClear();

    const dupWatcher = collection.add(...createWatcherArgs("/a", "*"));
    expect(mockRegister).not.toBeCalled();

    watchers[0].dispose();
    expect(mockUnregister).not.toBeCalled();
    dupWatcher.dispose();
    expect(mockUnregister).toBeCalledWith("/a", false);

    watchers[1].dispose();
    expect(mockUnregister).toBeCalledWith("/a/b", false);
  });

  it("should unregister non-recursive watchers on recursive watcher registered", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const nonRecursiveWatchers = [
      collection.add(...createWatcherArgs("/a", "*")),
      collection.add(...createWatcherArgs("/a/b", "*")),
    ];

    const recursiveWatcher = collection.add(...createWatcherArgs("/a", "**"));
    expect(mockUnregister).toBeCalledWith("/a", false);
    expect(mockUnregister).toBeCalledWith("/a/b", false);

    mockUnregister.mockClear();
    recursiveWatcher.dispose();
    expect(mockUnregister).not.toBeCalled();

    nonRecursiveWatchers[0].dispose();
    expect(mockUnregister).not.toBeCalled();

    // only when all the relevant watchers disposed could the recursive watcher be unregistered
    nonRecursiveWatchers[1].dispose();
    expect(mockUnregister).toBeCalledWith("/a", true);
  });
});
