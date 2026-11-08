// @vitest-environment node
import { describe, expect, it } from "vitest";

import { extractRoomShareUrl } from "../src/renderer/src/utils/recorder";

describe("直播间分享文案链接提取", () => {
  it("提取抖音分享文案中的短链接", () => {
    expect(
      extractRoomShareUrl(
        "9- 长按复制此条消息，打开抖音搜索，查看TA的更多作品。 https://v.douyin.com/OumWgbdrNlc/ 9@9.com :2pm",
      ),
    ).toBe("https://v.douyin.com/OumWgbdrNlc/");
  });

  it.each([
    [
      "来看直播：http://xhslink.com/m/54KhCYhGUZA，复制后打开小红书",
      "http://xhslink.com/m/54KhCYhGUZA",
    ],
    [
      "分享【https://www.xiaohongshu.com/user/profile/123?xsec_token=abc%2Fdef&source=share】",
      "https://www.xiaohongshu.com/user/profile/123?xsec_token=abc%2Fdef&source=share",
    ],
    ["直播（https://live.douyin.com/123）。", "https://live.douyin.com/123"],
    ["主页(https://www.douyin.com/user/abc).", "https://www.douyin.com/user/abc"],
    ["分享 https://v.douyin.com/abc/!", "https://v.douyin.com/abc/"],
  ])("提取分享链接并保留查询参数：%s", (input, expected) => {
    expect(extractRoomShareUrl(input)).toBe(expected);
  });

  it("多个链接时只提取第一个", () => {
    expect(
      extractRoomShareUrl("分享 https://v.douyin.com/first/ https://xhslink.com/m/second"),
    ).toBe("https://v.douyin.com/first/");
  });

  it.each([
    "",
    "没有链接的分享文案",
    "https://live.bilibili.com/123",
    "分享 https://live.bilibili.com/123",
    "分享 https://douyin.com.example.com/123",
    "分享 https://notdouyin.com/123",
    "分享 https://example.com/ https://v.douyin.com/second/",
    "分享 https://%invalid/",
    "https://v.douyin.com/abc/",
    "http://xhslink.com/m/abc?foo=1&bar=2",
  ])("保持其他输入或纯链接的原有行为：%s", (input) => {
    expect(extractRoomShareUrl(input)).toBe(input);
  });
});
