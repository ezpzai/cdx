import assert from "node:assert/strict";
import test from "node:test";
import { mapSequential } from "./async.js";

test("mapSequential은 비동기 작업을 순차적으로 처리한다", async () => {
  const started: number[] = [];
  const finished: number[] = [];
  let activeCount = 0;
  let maxActiveCount = 0;

  const result = await mapSequential([1, 2, 3], async (value: number) => {
    started.push(value);
    activeCount += 1;
    maxActiveCount = Math.max(maxActiveCount, activeCount);

    await new Promise((resolve) => setTimeout(resolve, 10));

    activeCount -= 1;
    finished.push(value);
    return value * 10;
  });

  assert.deepEqual(result, [10, 20, 30]);
  assert.deepEqual(started, [1, 2, 3]);
  assert.deepEqual(finished, [1, 2, 3]);
  assert.equal(maxActiveCount, 1);
});
