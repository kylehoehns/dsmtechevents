import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lumaPhoto } from '../src/lib/luma.mjs';

test('lumaPhoto serves a Luma image from our own /img/luma/ path', () => {
  assert.deepEqual(lumaPhoto('https://images.lumacdn.com/uploads/6c/d3c66d47-fef4-4f9d-b0b0-03ec162c8b3e.png'), {
    small: '/img/luma/180/uploads/6c/d3c66d47-fef4-4f9d-b0b0-03ec162c8b3e.png',
    large: '/img/luma/600/uploads/6c/d3c66d47-fef4-4f9d-b0b0-03ec162c8b3e.png',
  });
  assert.equal(lumaPhoto('https://images.lumacdn.com/uploads/../secret.png'), null);
  assert.equal(lumaPhoto('https://images.lumacdn.com/uploads/a/b.png?x=1'), null);
  assert.equal(lumaPhoto('https://example.com/uploads/a/b.png'), null);
  assert.equal(lumaPhoto(null), null);
});
