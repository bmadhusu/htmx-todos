import { test } from 'node:test';
import assert from 'node:assert/strict';

// TEMPORARY: proves `deploy: needs: test` blocks a failing commit from
// reaching production. Reverted immediately after the experiment.
test('deliberately failing test to verify the deploy gate', () => {
  assert.equal('gate', 'should block this');
});
