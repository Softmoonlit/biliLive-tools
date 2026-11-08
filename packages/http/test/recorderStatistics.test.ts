import { beforeEach, describe, expect, it, vi } from "vitest";

const { recorders } = vi.hoisted(() => ({
  recorders: [] as Array<{
    disableAutoCheck?: boolean;
    tempStopIntervalCheck?: boolean;
    recordHandle?: object;
  }>,
}));

vi.mock("../src/index.js", () => ({
  container: {
    resolve: () => ({ manager: { recorders } }),
  },
}));
vi.mock("@biliLive-tools/shared/recorder/recordHistory.js", () => ({ default: {} }));
vi.mock("@biliLive-tools/shared/utils/log.js", () => ({ default: {} }));
vi.mock("@biliLive-tools/shared/enum.js", () => ({ defaultRecordConfig: {} }));

import recorderService from "../src/services/recorder.js";

describe("自动监听数量", () => {
  beforeEach(() => {
    recorders.length = 0;
  });

  it("没有直播间时返回零", () => {
    expect(recorderService.getAutoMonitorNum()).toBe(0);
  });

  it("计入跳过本场及正在录制的自动监听直播间，排除手动监听", () => {
    recorders.push(
      { disableAutoCheck: false },
      { disableAutoCheck: false, tempStopIntervalCheck: true },
      { disableAutoCheck: false, recordHandle: {} },
      { disableAutoCheck: true },
      { disableAutoCheck: true, recordHandle: {} },
    );

    expect(recorderService.getAutoMonitorNum()).toBe(3);
    expect(recorderService.getRecorderNum(false)).toBe(5);
    expect(recorderService.getRecorderNum(true)).toBe(2);
  });

  it("监听模式切换后重新统计，并与列表的自动监听判断保持一致", () => {
    recorders.push({ disableAutoCheck: false }, {});
    expect(recorderService.getAutoMonitorNum()).toBe(2);

    recorders[0].disableAutoCheck = true;
    expect(recorderService.getAutoMonitorNum()).toBe(1);

    recorders[0].disableAutoCheck = false;
    expect(recorderService.getAutoMonitorNum()).toBe(2);
  });
});
