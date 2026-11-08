const shareLinkDomains = ["douyin.com", "xiaohongshu.com", "xhslink.com"];

/** 从抖音、小红书分享文案中提取首个链接，其他输入保持原样。 */
export function extractRoomShareUrl(input: string): string {
  const match = input.match(/https?:\/\/[^\s<>"'`，。！？；：（）【】《》、()\[\]{}]+/i);
  if (!match) return input;

  const url = match[0].replace(/[.,!;:]+$/, "");
  try {
    const { hostname } = new URL(url);
    if (shareLinkDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return url;
    }
  } catch {
    // 无法识别的输入交由原有解析流程处理。
  }
  return input;
}
