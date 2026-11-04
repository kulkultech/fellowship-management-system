import { describe, expect, it } from 'vitest';
import { loginPathFor, roomPath, safeReturnTo } from './shareLinks';

describe('share links', () => {
  it('points at a room section and an item in it', () => {
    expect(roomPath('kulkul', 'bootcamp')).toBe('/programs/kulkul/bootcamp/room');
    expect(roomPath('kulkul', 'bootcamp', 'resources', 'abc')).toBe('/programs/kulkul/bootcamp/room?section=resources&item=abc');
  });

  it('sends a signed-out visitor to sign in and back', () => {
    expect(loginPathFor({ pathname: '/programs/k/b/room', search: '?section=assignments&item=1' })).toBe(
      '/login?return_to=%2Fprograms%2Fk%2Fb%2Froom%3Fsection%3Dassignments%26item%3D1'
    );
  });

  it('only returns to pages on this site', () => {
    expect(safeReturnTo('/sessions/1/room')).toBe('/sessions/1/room');
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
  });
});
