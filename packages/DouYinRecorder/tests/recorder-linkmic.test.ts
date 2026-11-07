import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clients: [] as any[],
  writers: [] as any[],
  downloader: null as any,
  getInfo: vi.fn(),
  getStream: vi.fn(),
}));
vi.mock("../src/stream.js", () => ({ getInfo: mocks.getInfo, getStream: mocks.getStream }));
vi.mock("../src/douyin_api.js", () => ({ resolveShortURL: vi.fn(), parseUser: vi.fn() }));
vi.mock("../src/linkmic.js", () => ({
  LinkmicListWriter: class {
    add = vi.fn();
    videoCreated = vi.fn();
    flush = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    reportError = vi.fn();
    constructor(public options: any) {
      mocks.writers.push(this);
    }
  },
}));
vi.mock("douyin-danma-listener", () => ({
  default: class extends EventEmitter {
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
    constructor(
      public room: string,
      public options: any,
    ) {
      super();
      mocks.clients.push(this);
    }
  },
}));
vi.mock("@bililive-tools/manager", () => ({
  defaultFromJSON: vi.fn(),
  defaultToJSON: vi.fn(),
  genRecorderUUID: () => "recorder-id",
  genRecordUUID: () => "record-id",
  utils: {
    singleton: (fn: any) => fn,
    checkTitleKeywordsWhileRecording: vi.fn().mockResolvedValue(false),
    checkTitleKeywordsBeforeRecord: vi.fn().mockReturnValue(false),
    shouldUseStrictQuality: vi.fn().mockReturnValue(false),
  },
  createDownloader: () => mocks.downloader,
}));

import { provider } from "../src/index.js";

function recorder(
  recordLinkmic: boolean,
  saveComments = false,
  cookieMode: "all" | "stream" | "danma" = "all",
) {
  const result = provider.createRecorder({
    channelId: "host",
    uid: "MS4wLjABhost",
    auth: "cookie-value",
    cookieMode,
    recordLinkmic,
    disableProvideCommentsWhenRecording: !saveComments,
    quality: "origin",
    streamPriorities: [],
    sourcePriorities: [],
  });
  result.cache = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() } as any;
  result.appendTimeline = vi.fn();
  return result;
}
const start = (recorder: ReturnType<typeof provider.createRecorder>) =>
  recorder.checkLiveStatusAndRecord({
    getSavePath: () => "/video/recording",
    banLiveId: undefined,
    isManualStart: false,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clients.length = 0;
  mocks.writers.length = 0;
  const info = {
    living: true,
    owner: "主播",
    title: "直播",
    cover: "",
    avatar: "",
    liveId: "room",
    uid: "MS4wLjABhost",
  };
  mocks.getInfo.mockResolvedValue(info);
  mocks.getStream.mockResolvedValue({
    ...info,
    currentStream: { name: "原画", source: "默认", url: "https://example.com/live.flv" },
    sources: [],
    streams: [],
  });
  mocks.downloader = Object.assign(new EventEmitter(), {
    type: "ffmpeg",
    videoFilePath: "/video/recording.ts",
    run: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    cut: vi.fn(),
    getArguments: vi.fn().mockReturnValue([]),
    getExtraDataController: vi.fn().mockReturnValue({ addMessage: vi.fn(), setMeta: vi.fn() }),
  });
});

describe("抖音名单录制集成", () => {
  it("名单和弹幕都关闭时不连接消息服务", async () => {
    const result = recorder(false);
    await start(result);
    expect(mocks.clients[0].connect).not.toHaveBeenCalled();
    expect(mocks.writers).toHaveLength(0);
    await result.recordHandle?.stop();
  });
  it("关闭弹幕也可收集名单，不保存聊天和礼物", async () => {
    const result = recorder(true);
    await start(result);
    const client = mocks.clients[0];
    const writer = mocks.writers[0];
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.options.enableLinkmic).toBe(true);
    const anchor = { secUid: "MS4wLjABother" };
    client.emit("linkmicAnchor", anchor);
    expect(writer.add).toHaveBeenCalledWith(anchor);
    for (const event of ["chat", "privilegeScreenChat", "screenChat", "gift"])
      client.emit(event, {});
    expect(mocks.downloader.getExtraDataController().addMessage).not.toHaveBeenCalled();
    mocks.downloader.emit("videoFileCreated", { filename: "/video/first.ts" });
    mocks.downloader.emit("videoFileCreated", { filename: "/video/second.ts" });
    expect(writer.videoCreated).toHaveBeenNthCalledWith(1, "/video/first.ts");
    expect(writer.videoCreated).toHaveBeenNthCalledWith(2, "/video/second.ts");
    await result.recordHandle?.stop();
    expect(writer.close).toHaveBeenCalledOnce();
  });
  it("原有弹幕录制保持正常，未开启时不创建名单写入器", async () => {
    const result = recorder(false, true);
    await start(result);
    mocks.clients[0].emit("chat", { content: "弹幕", user: { id: "1", nickName: "观众" } });
    expect(mocks.clients[0].connect).toHaveBeenCalledOnce();
    expect(mocks.downloader.getExtraDataController().addMessage).toHaveBeenCalledOnce();
    expect(mocks.writers).toHaveLength(0);
    await result.recordHandle?.stop();
  });
  it.each([
    { mode: "all", expected: "cookie-value" },
    { mode: "stream", expected: undefined },
    { mode: "danma", expected: "cookie-value" },
  ] as const)("保持 $mode 模式的消息连接 Cookie 选择", async ({ mode, expected }) => {
    const result = recorder(true, false, mode);
    await start(result);
    expect(mocks.clients[0].options.cookie).toBe(expected);
    expect(mocks.getInfo).toHaveBeenCalledWith(
      "host",
      expect.objectContaining({ auth: mode === "danma" ? undefined : "cookie-value" }),
    );
    await result.recordHandle?.stop();
  });
  it("全局开关变化不改变当前录制，下一次录制才使用新值", async () => {
    const result = recorder(true);
    await start(result);
    result.recordLinkmic = false;
    mocks.clients[0].emit("linkmicAnchor", { secUid: "MS4wLjABother" });
    expect(mocks.writers[0].add).toHaveBeenCalledOnce();
    await result.recordHandle?.stop();
    await start(result);
    expect(mocks.clients[1].options.enableLinkmic).toBe(false);
    expect(mocks.clients[1].connect).not.toHaveBeenCalled();
    expect(mocks.writers).toHaveLength(1);
    await result.recordHandle?.stop();
  });
  it("名单错误写入日志和时间线，不停止录像", async () => {
    const result = recorder(true);
    const debug = vi.fn();
    result.on("DebugLog", debug);
    await start(result);
    mocks.writers[0].options.onError("连麦主播名单：磁盘已满");
    expect(result.appendTimeline).toHaveBeenCalledWith({ text: "连麦主播名单：磁盘已满" });
    expect(debug).toHaveBeenCalledWith(expect.objectContaining({ text: "连麦主播名单：磁盘已满" }));
    expect(mocks.downloader.stop).not.toHaveBeenCalled();
    await result.recordHandle?.stop();
  });
  it("下载器停止报错时仍执行名单最终补写", async () => {
    const result = recorder(true);
    await start(result);
    mocks.downloader.stop.mockRejectedValueOnce(new Error("停止失败"));
    await result.recordHandle?.stop();
    expect(mocks.writers[0].close).toHaveBeenCalledOnce();
    expect(result.recordHandle).toBeUndefined();
  });
});
