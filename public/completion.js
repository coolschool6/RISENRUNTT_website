const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const check = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m12 25 8 8 17-18"/></svg>';
const mediaPath = value => /^\/(assets|media)\/[\w./-]+$/.test(value || '') ? escape(value) : '';

export function completionMarkup(data) {
  const approved = data.status === 'approved';
  const artwork = mediaPath(data.medal);
  const eventPath = data.eventId ? '/events/' + encodeURIComponent(data.eventId) : '/events';
  const metrics = [['DISTANCE', data.distance + ' km'], ['FINISH TIME', data.time], ['AVERAGE PACE', data.pace], ['ACTIVITY DATE', data.date]];
  return `<section class="completion ${approved ? 'is-approved' : ''}" data-completion-id="${escape(data.id)}" aria-labelledby="completion-heading">
    <div class="confetti-layer" aria-hidden="true"></div>
    <div class="completion-grain" aria-hidden="true"></div>
    <div class="container">
      <div class="finish-topline"><a href="/my-runs">← My runs</a><span>RISE & RUN TT / YOUR RUNNING JOURNEY</span></div>
      <div class="finish-layout">
        <div class="finish-copy">
          <div class="received-label">${check}<span>${approved ? 'FINISH VERIFIED' : 'RUN RECEIVED'}</span></div>
          <h1 id="completion-heading">You showed up.<br><em>${approved ? 'It’s official.' : 'That counts.'}</em></h1>
          <p class="finish-personal">Beautiful effort, <strong>${escape(data.name)}.</strong></p>
          <p class="finish-description">${approved ? 'Your activity has been reviewed and your finish is now part of the official results.' : 'Your run is safely saved. Take a breath, enjoy the moment—we’ll take it from here.'}</p>
          <div class="review-explainer">${approved ? '<span class="review-dot verified"></span><div><strong>Your result is official</strong><small>View your finish and share your result.</small></div>' : '<span class="review-dot"></span><div><strong>Awaiting human review</strong><small>Your result is published only after approval.</small></div>'}</div>
          <div class="actions finish-actions"><a class="button" href="${approved ? '/results/' + encodeURIComponent(data.id) : '/my-runs'}">${approved ? 'View & share result' : 'Track my submission'} <span aria-hidden="true">↗</span></a><button class="replay-button" type="button" id="replay-celebration"><span aria-hidden="true">↻</span> Replay the moment</button></div>
          <p class="motion-note hidden" id="motion-note">Motion is reduced to match your device preference.</p>
        </div>
        <div class="finish-visual">
          <svg class="finish-orbit" viewBox="0 0 560 600" fill="none" aria-hidden="true"><ellipse cx="280" cy="285" rx="261" ry="242" transform="rotate(-24 280 285)"/><ellipse class="orbit-dashes" cx="280" cy="285" rx="240" ry="222" transform="rotate(-24 280 285)"/><path class="orbit-progress" pathLength="1" d="M34 345C-8 83 410-57 526 198c111 243-306 424-428 210"/><circle cx="34" cy="345" r="5"/><circle cx="98" cy="408" r="5"/></svg>
          <div class="finish-art-caption"><span>THE EFFORT IS YOURS.</span><span>THE MOMENT, TOO.</span></div>
          <div class="medal-print">
            <div class="print-top"><span>RISE & RUN</span><span>${escape(data.eventDistance || data.distance)}K / ${escape(data.activity || 'RUN').toUpperCase()}</span></div>
            ${artwork ? `<div class="print-image"><img src="${artwork}" alt="${escape(data.eventName)} event medal" fetchpriority="high"><div class="print-image-shade"></div></div>` : `<div class="print-image finish-symbol">${check}<span>EVERY FINISH MATTERS</span></div>`}
            <div class="print-caption"><span>YOUR EVENT</span><h2>${escape(data.eventName)}</h2><p>YOUR ROUTE. YOUR PACE. YOUR STORY.</p></div>
          </div>
          <div class="finish-seal" aria-label="${approved ? 'Verified finish' : 'Submission received'}"><span>${approved ? 'VERIFIED' : 'SUBMITTED'}</span>${check}<small>${approved ? 'OFFICIAL FINISH' : 'EFFORT RECEIVED'}</small></div>
        </div>
      </div>
    </div>
  </section>
  <section class="finish-receipt-section"><div class="container">
    <div class="finish-receipt"><div class="receipt-heading"><span class="kicker">A little record of a big effort</span><span class="receipt-status">${approved ? 'VERIFIED ACTIVITY' : 'SUBMITTED ACTIVITY'}</span></div><dl class="receipt-metrics">${metrics.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></div>
    <ol class="finish-tracker" aria-label="Submission progress"><li class="complete"><span>✓</span><div><strong>Run submitted</strong><small>Your activity is safely saved.</small></div></li><li class="${approved ? 'complete' : 'current'}"><span>${approved ? '✓' : '02'}</span><div><strong>${approved ? 'Review completed' : 'Human review'}</strong><small>${approved ? 'Your effort has been checked.' : 'Our team checks your activity.'}</small></div></li><li class="${approved ? 'complete' : ''}"><span>${approved ? '✓' : '03'}</span><div><strong>Official result</strong><small>${approved ? 'Your finish is on the leaderboard.' : 'Published when approved.'}</small></div></li></ol>
    <div class="finish-bottom"><p>${approved ? 'One finish. Another reason to keep rising.' : 'You can check your progress at any time in My runs.'}</p><a class="text-link" href="${eventPath}${data.eventId ? '/results' : ''}">Event results <span>↗</span></a></div>
  </div></section>`;
}

export function initCompletion(root = document) {
  const scene = root.querySelector('.completion');
  if (!scene) return;
  const button = root.querySelector('#replay-celebration');
  const layer = scene.querySelector('.confetti-layer');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cleanupTimer;
  const clear = () => {clearTimeout(cleanupTimer);layer.replaceChildren();scene.classList.remove('celebrating');button.disabled=false;};
  const play = () => {
    clear();
    if (preference.matches) return;
    button.disabled = true;
    scene.classList.add('celebrating');
    for (let i=0;i<36;i++) {
      const particle=document.createElement('i');
      const side=i%2 ? 1 : -1;
      particle.style.cssText=`--x:${side*(40+(i*71)%530)}px;--y:${-75-(i*43)%330}px;--r:${side*(150+i*39)}deg;--delay:${(i%6)*45}ms;--color:${['#dfb96f','#f4eee1','#cf715f','#83a9a0'][i%4]};--size:${5+i%5}px;`;
      if (i%3===0) particle.className='round';
      layer.append(particle);
    }
    cleanupTimer=setTimeout(clear,3800);
  };
  const updatePreference=()=>{
    button.hidden=preference.matches;
    root.querySelector('#motion-note').classList.toggle('hidden',!preference.matches);
    if(preference.matches) clear();
  };
  button.addEventListener('click',play);
  preference.addEventListener('change',updatePreference);
  updatePreference();
  window.addEventListener('pagehide',clear,{once:true});
  if(new URLSearchParams(location.search).get('submitted')==='1') {
    let seen=false;
    try {seen=sessionStorage.getItem('rr-celebrated:'+scene.dataset.completionId)==='1';sessionStorage.setItem('rr-celebrated:'+scene.dataset.completionId,'1');} catch {}
    if(!seen) requestAnimationFrame(()=>requestAnimationFrame(play));
  }
}
