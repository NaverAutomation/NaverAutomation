import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPexelsImages } from '../src/server/services/pexels-service.js';

describe('searchPexelsImages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty array if apiKey is missing or invalid', async () => {
    const result = await searchPexelsImages('YOUR_KEY_HERE', 'dog');
    expect(result).toEqual([]);
  });

  it('should fetch larger perPage from Pexels API and return shuffled subset', async () => {
    // Mock global fetch
    const mockPhotos = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      src: {
        large: `https://example.com/large-${i}.jpg`,
      },
    }));

    const mockResponse = {
      ok: true,
      json: async () => ({ photos: mockPhotos }),
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    const result = await searchPexelsImages('valid_api_key', 'dog', 4);

    // Verify fetch was called with apiPerPage = 40 (Math.max(4 * 10, 40))
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('per_page=40'),
      expect.any(Object)
    );

    // Verify the return size is exactly 4
    expect(result).toHaveLength(4);

    // Check if the returned array is shuffled (extremely low probability of picking exactly first 4 in order)
    const firstFourUrls = mockPhotos.slice(0, 4).map((p) => p.src.large);
    expect(result).not.toEqual(firstFourUrls);
  });
});
