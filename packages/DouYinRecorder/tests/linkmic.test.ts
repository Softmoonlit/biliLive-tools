import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkmicListWriter } from "../src/linkmic.js";

const anchor = {
  secUid: "MS4wLjABother",
  nickname: "其他主播",
  displayId: "other123",
  userId: "12345",
};
let directory: string;
let onError: ReturnType<typeof vi.fn>;
const writers: LinkmicListWriter[] = [];
const createWriter = () => {
  const writer = new LinkmicListWriter({
    selfSecUid: "MS4wLjABself",
    selfChannelId: "self",
    onError,
  });
  writers.push(writer);
  return writer;
};
const video = () => path.join(directory, "第一段.ts");
const list = () => path.join(directory, "第一段.连麦记录.txt");

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bililive-linkmic-"));
  onError = vi.fn();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await Promise.all(writers.splice(0).map((writer) => writer.close()));
  await fs.rm(directory, { recursive: true, force: true });
});

describe("一次录制的连麦主播名单", () => {
  it("没有主播时不创建文件", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    await writer.close();
    expect(await fs.readdir(directory)).toEqual([]);
  });
  it("录像创建前收到的主播会补写，分段和重连重复消息不重复记录", async () => {
    const writer = createWriter();
    writer.add(anchor);
    await writer.flush();
    expect(await fs.readdir(directory)).toEqual([]);
    writer.videoCreated(video());
    await writer.flush();
    writer.videoCreated(path.join(directory, "另一个目录", "第二段.ts"));
    writer.add(anchor);
    writer.add({ ...anchor, nickname: "重连后的昵称" });
    await writer.close();
    expect(await fs.readdir(directory)).toEqual(["第一段.连麦记录.txt"]);
    const text = await fs.readFile(list(), "utf8");
    expect(text.trim().split("\n")).toHaveLength(1);
    expect(text).toContain("主播: 其他主播");
    expect(text).toContain("抖音号: other123");
    expect(text).toContain("UID: 12345");
    expect(text).toContain("https://www.douyin.com/user/MS4wLjABother");
  });
  it("首次发现时间不会因为路径未就绪或重试而改变", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, 20, 1, 2));
    const writer = createWriter();
    writer.add(anchor);
    await writer.flush();
    vi.setSystemTime(new Date(2026, 10, 8, 20, 30, 0));
    writer.videoCreated(video());
    await writer.close();
    expect(await fs.readFile(list(), "utf8")).toContain("[2026-11-08 20:01:02]");
  });
  it("排除本人，后续一次录制仍可记录相同主播", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    writer.add({ ...anchor, secUid: "MS4wLjABself" });
    writer.add({ ...anchor, displayId: "self" });
    writer.add(anchor);
    await writer.close();
    const next = createWriter();
    next.videoCreated(path.join(directory, "新录制.ts"));
    next.add(anchor);
    await next.close();
    expect(await fs.readdir(directory)).toHaveLength(2);
    expect((await fs.readFile(list(), "utf8")).trim().split("\n")).toHaveLength(1);
  });
  it("写入失败后保留主播，下一条消息触发补写且不丢失", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    await writer.flush();
    const append = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("磁盘暂不可写"));
    writer.add(anchor);
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("磁盘暂不可写")),
    );
    expect(append).toHaveBeenCalledTimes(1);
    writer.add(anchor);
    await writer.close();
    expect(append).toHaveBeenCalledTimes(2);
    expect((await fs.readFile(list(), "utf8")).trim().split("\n")).toHaveLength(1);
  });
  it("目录创建失败不向调用方抛异常，后续分段能够重试", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    await writer.flush();
    vi.spyOn(fs, "mkdir").mockRejectedValueOnce(new Error("目录不可写"));
    writer.add(anchor);
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("目录不可写")),
    );
    writer.videoCreated(path.join(directory, "下一段.ts"));
    await writer.close();
    expect(await fs.readFile(list(), "utf8")).toContain(anchor.secUid);
  });
  it("停止录制时最后重试一次，并提示仍未保存的主播数量", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    await writer.flush();
    const append = vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("磁盘已满"));
    writer.add(anchor);
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("磁盘已满")),
    );
    expect(append).toHaveBeenCalledTimes(1);
    await writer.close();
    expect(append).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("仍有 1 位主播未能保存"));
  });
  it("并发消息按顺序写入，并清理字段中的换行", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    for (let i = 0; i < 20; i++)
      writer.add({ ...anchor, secUid: `MS4wLjAB${i}`, nickname: "昵称\n换行" });
    await writer.close();
    const lines = (await fs.readFile(list(), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(20);
    expect(lines[0]).toContain("昵称 换行");
  });
  it("底层文件操作挂起时，停止操作有时间上限", async () => {
    const writer = createWriter();
    writer.videoCreated(video());
    await writer.flush();
    const append = vi.spyOn(fs, "writeFile").mockImplementation(() => new Promise(() => {}));
    writer.add(anchor);
    // 等实际文件操作进入挂起状态后再推进计时器。
    await vi.waitFor(() => expect(append).toHaveBeenCalled());
    vi.useFakeTimers();
    const stop = writer.close();
    await vi.advanceTimersByTimeAsync(3500);
    await stop;
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("写入超时"));
  });
});
