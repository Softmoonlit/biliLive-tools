import fs from "node:fs/promises";
import path from "node:path";
import type { LinkmicAnchor } from "douyin-danma-listener";

interface PendingAnchor {
  anchor: LinkmicAnchor;
  firstSeen: Date;
}

/** 一次录制对应一份名单；首次录像创建前的消息和失败写入都留待补写。 */
export class LinkmicListWriter {
  private pending = new Map<string, PendingAnchor>();
  private recorded = new Set<string>();
  private filePath?: string;
  private running?: Promise<void>;
  private requested = false;
  private accepting = true;
  private closed = false;
  private lastError?: { text: string; time: number };
  private abortController = new AbortController();

  constructor(
    private options: {
      selfSecUid?: string;
      selfChannelId: string;
      onError: (text: string) => void;
    },
  ) {}

  reportError(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    // 重复故障保留提示，但避免每条消息都刷录制时间线。
    if (this.lastError?.text === text && now - this.lastError.time < 30000) return;
    this.lastError = { text, time: now };
    this.options.onError(`连麦主播名单：${text}`);
  }

  add(anchor: LinkmicAnchor) {
    if (!this.accepting) return;
    if (
      anchor.secUid &&
      anchor.secUid !== this.options.selfSecUid &&
      ![anchor.userId, anchor.displayId].includes(this.options.selfChannelId) &&
      !this.recorded.has(anchor.secUid) &&
      !this.pending.has(anchor.secUid)
    ) {
      this.pending.set(anchor.secUid, { anchor, firstSeen: new Date() });
    }
    void this.flush();
  }

  videoCreated(filename: string) {
    if (!this.accepting) return;
    if (!this.filePath) {
      const parsed = path.parse(filename);
      this.filePath = path.join(parsed.dir, `${parsed.name}.连麦记录.txt`);
    }
    void this.flush();
  }

  flush(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.requested = true;
    if (!this.running) {
      this.running = (async () => {
        do {
          this.requested = false;
          await this.writePending();
        } while (this.requested && !this.closed);
      })().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  private async writePending() {
    if (!this.filePath || !this.pending.size || this.closed) return;
    const signal = AbortSignal.any([this.abortController.signal, AbortSignal.timeout(3000)]);
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      for (const [secUid, entry] of this.pending) {
        signal.throwIfAborted();
        const clean = (text: string) => text.replace(/[\r\n\t|]/g, " ") || "未知";
        const date = entry.firstSeen;
        const pad = (n: number) => String(n).padStart(2, "0");
        const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        const { anchor } = entry;
        const line = `[${timestamp}] 主播: ${clean(anchor.nickname)} | 抖音号: ${clean(anchor.displayId)} | UID: ${clean(anchor.userId)} | 主页: https://www.douyin.com/user/${anchor.secUid}\n`;
        await fs.writeFile(this.filePath, line, { encoding: "utf8", flag: "a", signal });
        // 只有写入成功才能去重，保留原首次发现时间直至补写成功。
        this.recorded.add(secUid);
        this.pending.delete(secUid);
      }
      this.lastError = undefined;
    } catch (error) {
      if (!this.closed) this.reportError(error);
    }
  }

  async close() {
    if (this.closed) return;
    this.accepting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.flush(),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            this.abortController.abort();
            this.reportError("停止录制时写入超时");
            resolve();
          }, 3500);
        }),
      ]);
      if (this.pending.size) {
        this.reportError(`停止录制时仍有 ${this.pending.size} 位主播未能保存`);
      }
    } finally {
      clearTimeout(timer);
      this.closed = true;
      this.abortController.abort();
    }
  }
}
