import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inputTags } from '../src/server/services/naver/naver-editor.js';

describe('Naver Editor inputTags Unit Test', () => {
  let mockLocator;
  let mockPage;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLocator = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      pressSequentially: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    };

    mockPage = {
      locator: vi.fn().mockReturnValue(mockLocator),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('콤마(,)로 구분된 태그 문자열을 올바르게 분할하여 입력해야 한다', async () => {
    await inputTags(mockPage, '맛집, 일상, 여행');

    expect(mockPage.locator).toHaveBeenCalledWith('#tag-input');
    expect(mockLocator.pressSequentially).toHaveBeenCalledTimes(3);
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(1, '맛집', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(2, '일상', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(3, '여행', expect.any(Object));
  });

  it('샵(#)과 공백으로 구분된 태그 문자열을 올바르게 분할하여 입력해야 한다', async () => {
    await inputTags(mockPage, '#맛집 #일상 #여행');

    expect(mockLocator.pressSequentially).toHaveBeenCalledTimes(3);
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(1, '맛집', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(2, '일상', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(3, '여행', expect.any(Object));
  });

  it('혼합된 형식(샵, 콤마, 여러 공백)의 태그 문자열도 올바르게 분할하여 입력해야 한다', async () => {
    await inputTags(mockPage, '#맛집,   #일상 여행, #힐링');

    expect(mockLocator.pressSequentially).toHaveBeenCalledTimes(4);
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(1, '맛집', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(2, '일상', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(3, '여행', expect.any(Object));
    expect(mockLocator.pressSequentially).toHaveBeenNthCalledWith(4, '힐링', expect.any(Object));
  });

  it('태그가 비어있거나 null인 경우 아무 작업도 수행하지 않아야 한다', async () => {
    await inputTags(mockPage, '');
    expect(mockPage.locator).not.toHaveBeenCalled();

    await inputTags(mockPage, null);
    expect(mockPage.locator).not.toHaveBeenCalled();
  });
});
