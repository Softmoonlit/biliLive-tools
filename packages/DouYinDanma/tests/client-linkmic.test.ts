import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import DouYinDanmaClient from "../src/index.js";
import protobuf from "../src/proto.js";

function frame(method: string, payload: Buffer) {
  const response = protobuf.douyin.Response.encode({
    messagesList: [{ method, payload }],
  }).finish();
  return Buffer.from(protobuf.douyin.PushFrame.encode({ payload: gzipSync(response) }).finish());
}
// 字段 33 的直播间标记与字段 46 的 sec_uid。
const payload = Buffer.concat([
  Buffer.from([0x88, 0x02, 0x01, 0xf2, 0x02, 0x0c]),
  Buffer.from("MS4wLjABtest"),
]);

describe("弹幕客户端连麦事件", () => {
  it("默认不开启解析，即使收到连麦消息也不发出主播事件", async () => {
    const client = new DouYinDanmaClient("room");
    const onAnchor = vi.fn();
    client.on("linkmicAnchor", onAnchor);
    await client.decode(frame("WebcastLinkMessage", payload));
    expect(onAnchor).not.toHaveBeenCalled();
  });
  it.each(["WebcastLinkMessage", "WebcastBattleMessage"])(
    "开启后从 %s 发出主播事件",
    async (method) => {
      const client = new DouYinDanmaClient("room", { enableLinkmic: true });
      const onAnchor = vi.fn();
      client.on("linkmicAnchor", onAnchor);
      await client.decode(frame(method, payload));
      expect(onAnchor).toHaveBeenCalledWith(expect.objectContaining({ secUid: "MS4wLjABtest" }));
    },
  );
  it("连麦解析失败发出独立错误事件，后续正常消息仍可处理", async () => {
    const client = new DouYinDanmaClient("room", { enableLinkmic: true });
    const onError = vi.fn();
    const onChat = vi.fn();
    client.on("linkmicError", onError);
    client.on("chat", onChat);
    await client.decode(frame("WebcastLinkMessage", Buffer.from([0])));
    const chat = protobuf.douyin.ChatMessage.encode({ content: "正常弹幕" }).finish();
    await client.decode(frame("WebcastChatMessage", Buffer.from(chat)));
    expect(onError).toHaveBeenCalledOnce();
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ content: "正常弹幕" }));
  });
  it("普通未知消息不会被当作连麦消息", async () => {
    const client = new DouYinDanmaClient("room", { enableLinkmic: true });
    const onAnchor = vi.fn();
    client.on("linkmicAnchor", onAnchor);
    await client.decode(frame("WebcastUnknownMessage", payload));
    expect(onAnchor).not.toHaveBeenCalled();
  });
});
