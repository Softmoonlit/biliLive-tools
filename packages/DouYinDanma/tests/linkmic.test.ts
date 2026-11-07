import { describe, expect, it } from "vitest";
import { extractLinkmicAnchors } from "../src/linkmic.js";

function varint(value: number | bigint) {
  let number = BigInt(value);
  const bytes: number[] = [];
  do {
    const byte = Number(number & 127n);
    number >>= 7n;
    bytes.push(byte | (number ? 128 : 0));
  } while (number);
  return Buffer.from(bytes);
}
function field(id: number, value: Buffer | string | number | bigint) {
  if (typeof value === "number" || typeof value === "bigint") {
    return Buffer.concat([varint(id * 8), varint(value)]);
  }
  const buffer = Buffer.from(value);
  return Buffer.concat([varint(id * 8 + 2), varint(buffer.length), buffer]);
}
function user(secUid = "MS4wLjABtest", ownRoom = true) {
  return Buffer.concat([
    field(1, 9876543210987654321n),
    field(3, "连麦主播"),
    field(38, "douyin123"),
    field(46, secUid),
    ...(ownRoom ? [field(33, 123)] : []),
  ]);
}

describe("连麦主播识别", () => {
  it("提取主播身份，保留超过安全整数范围的 UID", () => {
    expect(extractLinkmicAnchors(user())).toEqual([
      {
        secUid: "MS4wLjABtest",
        nickname: "连麦主播",
        displayId: "douyin123",
        userId: "9876543210987654321",
      },
    ]);
  });
  it("递归发现主播，并对同一消息中的重复主播去重", () => {
    expect(extractLinkmicAnchors(Buffer.concat([field(7, user()), field(8, user())]))).toHaveLength(
      1,
    );
  });
  it("普通用户结构没有直播间标记时不作为主播", () => {
    expect(extractLinkmicAnchors(user("MS4wLjABaudience", false))).toEqual([]);
  });
  it("明确标记为上麦观众的用户即使有直播间字段也被排除", () => {
    const audience = Buffer.concat([field(1, user()), field(11, field(3, 1))]);
    expect(extractLinkmicAnchors(audience)).toEqual([]);
  });
  it("识别旧补丁中的主播包装结构", () => {
    const anchor = Buffer.concat([
      field(1, user("MS4wLjABwrapped", false)),
      field(11, field(2, 1)),
    ]);
    expect(extractLinkmicAnchors(anchor).map((item) => item.secUid)).toEqual(["MS4wLjABwrapped"]);
  });
  it("不接受任意文本作为主页身份", () => {
    expect(extractLinkmicAnchors(user("https://example.com"))).toEqual([]);
  });
  it("遇到非消息的嵌套文本仍能解析其他主播", () => {
    const payload = Buffer.concat([field(6, "not-a-protobuf-message"), field(7, user())]);
    expect(extractLinkmicAnchors(payload)).toHaveLength(1);
  });
  it("拒绝截断、非法字段和超大消息", () => {
    expect(() => extractLinkmicAnchors(user().subarray(0, -1))).toThrow();
    expect(() => extractLinkmicAnchors(Buffer.from([0]))).toThrow();
    expect(() => extractLinkmicAnchors(Buffer.alloc(1024 * 1024 + 1))).toThrow();
  });
  it("超过嵌套深度限制时停止扫描", () => {
    let payload = user();
    for (let i = 0; i < 10; i++) payload = field(7, payload);
    expect(extractLinkmicAnchors(payload)).toEqual([]);
  });
});
