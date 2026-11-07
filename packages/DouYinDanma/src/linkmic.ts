import type { LinkmicAnchor } from "../types/types.js";
export type { LinkmicAnchor } from "../types/types.js";

type ProtoValue = Buffer | bigint;
type ProtoFields = Map<number, ProtoValue[]>;

// 尚未有完整的连麦协议定义，保留旧补丁的字段识别规则并限制解析工作量。
function decodeFields(buffer: Buffer): ProtoFields {
  const fields: ProtoFields = new Map();
  let offset = 0;
  const readVarint = () => {
    let value = 0n;
    for (let i = 0; i < 10; i++) {
      if (offset >= buffer.length) throw new Error("连麦消息 varint 不完整");
      const byte = buffer[offset++];
      if (i === 9 && byte > 1) throw new Error("连麦消息 varint 溢出");
      value |= BigInt(byte & 0x7f) << BigInt(i * 7);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("连麦消息 varint 过长");
  };
  while (offset < buffer.length) {
    const tag = readVarint();
    const field = Number(tag >> 3n);
    const wireType = Number(tag & 7n);
    if (field < 1 || field > 0x1fffffff) throw new Error("连麦消息字段编号无效");
    let value: ProtoValue | undefined;
    if (wireType === 0) {
      value = readVarint();
    } else if (wireType === 2) {
      const length = Number(readVarint());
      if (!Number.isSafeInteger(length) || length > buffer.length - offset) {
        throw new Error("连麦消息字段长度无效");
      }
      value = buffer.subarray(offset, offset + length);
      offset += length;
    } else if (wireType === 1 || wireType === 5) {
      offset += wireType === 1 ? 8 : 4;
      if (offset > buffer.length) throw new Error("连麦消息定长字段不完整");
    } else {
      throw new Error("连麦消息 wire type 不支持");
    }
    if (value !== undefined) {
      const values = fields.get(field) ?? [];
      values.push(value);
      fields.set(field, values);
    }
  }
  return fields;
}

function text(fields: ProtoFields, field: number): string {
  const value = fields.get(field)?.[0];
  return Buffer.isBuffer(value) ? value.toString("utf8") : value?.toString() || "";
}

export function extractLinkmicAnchors(payload: Buffer): LinkmicAnchor[] {
  if (payload.length > 1024 * 1024) throw new Error("连麦消息超过解析大小限制");
  const anchors = new Map<string, LinkmicAnchor>();
  let visited = 0;
  const addUser = (fields: ProtoFields, requireOwnRoom: boolean) => {
    const secUid = text(fields, 46);
    if (!/^MS4wLj[A-Za-z0-9_=-]+$/.test(secUid)) return;
    if (requireOwnRoom && !fields.has(33)) return;
    if (anchors.has(secUid)) return;
    const userId = text(fields, 1);
    anchors.set(secUid, {
      secUid,
      nickname: text(fields, 3),
      displayId: text(fields, 38) || text(fields, 2) || userId,
      userId,
    });
  };
  const scan = (buffer: Buffer, depth: number, fields?: ProtoFields) => {
    if (depth > 8 || ++visited > 2048) return;
    try {
      fields ??= decodeFields(buffer);
    } catch {
      // 任意 length-delimited 字段也可能是字符串，不能都当作嵌套消息。
      return;
    }
    const user = fields.get(1)?.[0];
    const content = fields.get(11)?.[0];
    if (Buffer.isBuffer(user) && Buffer.isBuffer(content)) {
      try {
        // 旧规则中的 content 字段 3 表示上麦观众，不再递归该用户以免误收。
        if (!decodeFields(content).has(3)) addUser(decodeFields(user), false);
      } catch {
        // 当前结构不符合旧补丁的用户包装格式。
      }
      return;
    }
    addUser(fields, true);
    for (const values of fields.values()) {
      for (const value of values) {
        if (Buffer.isBuffer(value) && value.length >= 10) scan(value, depth + 1);
      }
    }
  };
  scan(payload, 0, decodeFields(payload));
  return [...anchors.values()];
}
