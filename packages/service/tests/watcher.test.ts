import { afterEach, describe, expect, it, vi } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { FileSystemWatcher, RegisteredWatcherCollection } from "../src/shims/watcher";
import { Barrier } from "../src/utils/barrier";

describe("watcher collection", async () => {
  const deregisteredQueue = new (class {
    inner: string[] = [];
    front = 0;
    next = new Barrier();
    push(val: string) {
      this.inner.push(val);
      this.next.open();
      this.next = new Barrier();
    }
    async pop() {
      if (this.front === this.inner.length) {
        await this.next.wait();
      }
      return this.inner[this.front++];
    }
    reset() {
      this.inner = [];
      this.front = 0;
      this.next = new Barrier();
    }
    async popNSorted(n: number) {
      const res: string[] = [];
      for (let i = 0; i < n; ++i) {
        res.push(await this.pop());
      }
      res.sort();
      return res;
    }
  })();

  const mockRegister = vi.fn();
  const registerWatcher = async (baseUri: URI) => {
    mockRegister(baseUri.path);
    return {
      dispose: () => deregisteredQueue.push(baseUri.path),
    };
  };

  const fakeEvent = new lsp.Emitter<lsp.FileEvent>().event;
  const createFileSystemWatcher = (basePath: string, pattern: string) =>
    new FileSystemWatcher(
      {
        baseUri: URI.from({ scheme: "file", path: basePath }),
        pattern,
      } as any,
      fakeEvent
    );

  afterEach(() => {
    deregisteredQueue.reset();
    mockRegister.mockClear();
  });

  it("should dedup based on path", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    collection.add(createFileSystemWatcher("/a/b", "**"));
    collection.add(createFileSystemWatcher("/a/c", "**"));
    collection.add(createFileSystemWatcher("/a", "**"));
    expect(mockRegister).toBeCalledWith("/a");
    expect(await deregisteredQueue.popNSorted(2)).toEqual(["/a/b", "/a/c"]);

    mockRegister.mockClear();
    collection.add(createFileSystemWatcher("/a", "b"));
    expect(mockRegister).not.toBeCalled();
  });

  it("should deregister watcher if unused", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const testWatchers = [createFileSystemWatcher("/a", "**"), createFileSystemWatcher("/a", "c")];
    const compareWatcher = createFileSystemWatcher("/b", "**");
    [...testWatchers, compareWatcher].forEach((w) => collection.add(w));
    testWatchers[0].dispose();
    compareWatcher.dispose();
    // for comparison, this actually test that "/a" is not deregistered
    expect(await deregisteredQueue.pop()).toBe("/b");

    testWatchers[1].dispose();
    // only if the two watchers disposed "/a" will be deregistered
    expect(await deregisteredQueue.pop()).toBe("/a");
  });

  it("should correctly handle transferred watcher", async () => {
    const collection = new RegisteredWatcherCollection(registerWatcher);
    const subWatcher = createFileSystemWatcher("/a/b", "**");
    const watcher = createFileSystemWatcher("/a", "**");
    const compareWatcher = createFileSystemWatcher("/b", "**");

    collection.add(subWatcher);
    collection.add(watcher);
    collection.add(compareWatcher);
    // now "/a/b" is transferred to "/a"
    expect(await deregisteredQueue.pop()).toBe("/a/b");
    expect(mockRegister).toBeCalledWith("/a");

    watcher.dispose();
    compareWatcher.dispose();
    // for comparison, this actually test that "/a" is not deregistered
    expect(await deregisteredQueue.pop()).toBe("/b");

    subWatcher.dispose();
    // only if the transferred watcher is also disposed "/a" will be deregistered
    expect(await deregisteredQueue.pop()).toBe("/a");
  });
});
