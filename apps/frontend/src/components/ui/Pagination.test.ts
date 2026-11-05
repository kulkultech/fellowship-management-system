import { describe, expect, it } from 'vitest';
import { pageWindow } from './Pagination';

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });
  it('shows first, last and neighbours of the current page', () => {
    expect(pageWindow(6, 12)).toEqual([1, '…', 5, 6, 7, '…', 12]);
    expect(pageWindow(1, 12)).toEqual([1, 2, '…', 12]);
    expect(pageWindow(12, 12)).toEqual([1, '…', 11, 12]);
  });
});
