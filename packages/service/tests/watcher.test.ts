import { afterEach, describe, expect, it, vi } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { RegisteredWatcherCollection } from "../src/shims/watcher";

describe("watcher collection", async () => {
  const mockRegister = vi.fn();
  const mockUnregister = vi.fn();
  const registerWatcher = (baseUri: URI) => {
    mockRegister(baseUri.path);
    return {
      dispose: () => {
        mockUnregister(baseUri.path);
      },
    };
  };

  const fakeEvent = new lsp.Emitter<lsp.FileEvent>().event;
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
    expect(mockRegister).toBeCalledWith("/a");
    expect(mockUnregister).toBeCalledWith("/a/b");
    expect(mockUnregister).toBeCalledWith("/a/c");

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
    expect(mockUnregister).toBeCalledWith("/a");
  });

  it("should correctly handle transferred watcher", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const subWatcher = collection.add(...createWatcherArgs("/a/b", "**"));
    const watcher = collection.add(...createWatcherArgs("/a", "**"));

    // now "/a/b" is transferred to "/a"
    expect(mockUnregister).toBeCalledWith("/a/b");
    expect(mockRegister).toBeCalledWith("/a");

    mockUnregister.mockClear();
    watcher.dispose();
    expect(mockUnregister).not.toBeCalled();

    subWatcher.dispose();
    // only if the transferred watcher is also disposed "/a" will be unregistered
    expect(mockUnregister).toBeCalledWith("/a");
  });
});
