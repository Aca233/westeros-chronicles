import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/TvTimelineModal.tsx', 'utf8');
assert.match(source, /useState<TimelineMode>\('actual'\)/, '时间线必须默认打开本世界视图');
assert.match(source, /projectActualTimeline\(worldHistory, CANONICAL_TIMELINE\)/, '本世界视图必须读取统一世界账本投影');
assert.match(source, /projectCanonicalTimeline\(worldHistory, CANONICAL_TIMELINE\)/, '原作节点视图必须读取条件化时间表投影');
assert.match(source, /historical:[^\n]*开局前历史/);
assert.match(source, /scheduled:[^\n]*原作预定/);
assert.match(source, /occurred:[^\n]*如期发生/);
assert.match(source, /diverged:[^\n]*已经偏离/);
assert.match(source, /suppressed:[^\n]*已经取代/);
assert.match(source, /data-timeline-status/);
assert.match(source, /timelineData\.years\.map/);
assert.match(source, /timelineData\.total_events/);
assert.doesNotMatch(source, /fetch\s*\(/, '时间线运行时不得再读取静态 JSON');
assert.doesNotMatch(source, /共计 35 个|298-305 AC/, '时间线年份和节点数不得保留旧硬编码');
console.log('World timeline uses committed history and the bundled conditional canon schedule.');
