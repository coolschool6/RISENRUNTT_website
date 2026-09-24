import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completionMarkup} from '../public/completion.js';

const sample={id:'qa-run',status:'pending',name:'Test Runner',eventId:'escape-to-paris-virtual-5k',eventName:'Escape to Paris',medal:'/assets/paris-medal.webp',eventDistance:5,distance:5.02,time:'28:42',pace:'05:43 /km',date:'23 Sept 2026',activity:'Run'};
test('Submission celebration is honest about pending review',()=>{
  const page=completionMarkup(sample);
  assert.match(page,/RUN RECEIVED/);
  assert.match(page,/Awaiting human review/);
  assert.match(page,/published only after approval/);
  assert.match(page,/SUBMITTED ACTIVITY/);
  assert.doesNotMatch(page,/FINISH VERIFIED|Your result is official/);
  for(const metric of ['5.02 km','28:42','05:43 /km','23 Sept 2026'])assert.ok(page.includes(metric));
});
test('Approved celebration has the verified state and share link',()=>{
  const page=completionMarkup({...sample,status:'approved'});
  assert.match(page,/FINISH VERIFIED/);
  assert.match(page,/href="\/results\/qa-run"/);
  assert.doesNotMatch(page,/Awaiting human review/);
});
test('Completion content is escaped and does not accept external or unsafe artwork URLs',()=>{
  const page=completionMarkup({...sample,name:'<script>alert(1)</script>',eventName:'<img onerror="alert(1)">',medal:'javascript:alert(1)'});
  assert.doesNotMatch(page,/<script>|<img onerror|javascript:/);
  assert.match(page,/&lt;script&gt;/);
  assert.match(page,/EVERY FINISH MATTERS/);
});
test('Public interface has no payment or booking copy',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/\b(payment|payments|checkout|booking|book now|pay now|purchase|register or pay)\b/i);
  assert.match(app,/submitted=1/);
});
test('Motion enhancements include reduced-motion and particle cleanup',()=>{
  const js=readFileSync(new URL('../public/completion.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/experience.css',import.meta.url),'utf8');
  assert.match(js,/prefers-reduced-motion: reduce/);
  assert.match(js,/setTimeout\(clear,3800\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
