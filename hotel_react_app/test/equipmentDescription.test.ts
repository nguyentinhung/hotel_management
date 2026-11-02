import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentDescriptionText, equipmentDescriptionTitle } from '../src/utils/equipmentDescription.ts';

test('equipment description displays short text unchanged', () => {
  assert.equal(equipmentDescriptionText('Hair dryer'), 'Hair dryer');
});

test('long equipment descriptions remain complete for CSS ellipsis and tooltip', () => {
  const description = 'Máy điều hòa 2 chiều, 12000 BTU, tiết kiệm điện và vận hành êm ái';
  assert.equal(equipmentDescriptionText(description), description);
  assert.equal(equipmentDescriptionTitle(description), description);
});

test('null, empty, and whitespace-only descriptions display a dash without an empty tooltip', () => {
  for (const description of [null, undefined, '', '   ']) {
    assert.equal(equipmentDescriptionText(description), '—');
    assert.equal(equipmentDescriptionTitle(description), undefined);
  }
});
