const clean=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function initShareTools(){
  const card=document.querySelector('#share-card');
  if(!card||document.querySelector('#download-certificate'))return;
  const actions=card.parentElement.querySelector('.actions');
  if(!actions)return;
  const title=card.querySelector('h2')?.textContent?.trim()||'Rise & Run TT finish';
  const runner=card.querySelector('p')?.textContent?.trim()||'Verified runner';
  const finish=card.querySelector('.result-time')?.textContent?.trim()||'';
  const makeCertificate=()=>{const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1131" viewBox="0 0 1600 1131"><rect width="1600" height="1131" fill="#f7f5ef"/><rect x="38" y="38" width="1524" height="1055" fill="none" stroke="#a78045" stroke-width="5"/><text x="800" y="230" text-anchor="middle" fill="#091d29" font-family="Arial, sans-serif" font-size="38" letter-spacing="9">RISE &amp; RUN TT</text><text x="800" y="350" text-anchor="middle" fill="#a78045" font-family="Georgia, serif" font-style="italic" font-size="86">Official Finisher</text><text x="800" y="490" text-anchor="middle" fill="#091d29" font-family="Arial, sans-serif" font-size="48">${clean(runner)}</text><line x1="530" y1="550" x2="1070" y2="550" stroke="#a78045" stroke-width="3"/><text x="800" y="650" text-anchor="middle" fill="#091d29" font-family="Arial, sans-serif" font-size="42">${clean(title)}</text><text x="800" y="745" text-anchor="middle" fill="#5f6b6c" font-family="Arial, sans-serif" font-size="31">VERIFIED FINISH · ${clean(finish)}</text><text x="800" y="930" text-anchor="middle" fill="#5f6b6c" font-family="Arial, sans-serif" font-size="24">Every run has a story.</text></svg>`;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download='Rise-Run-TT-finisher-certificate.svg';a.click();URL.revokeObjectURL(url);};
  const certificate=document.createElement('button');certificate.id='download-certificate';certificate.className='button outline';certificate.type='button';certificate.textContent='Download certificate';certificate.onclick=makeCertificate;
  const share=document.createElement('button');share.className='button outline';share.type='button';share.textContent='Share finish';share.onclick=async()=>{const message=`I completed ${title} with Rise & Run TT — ${finish}.`;try{if(navigator.share)await navigator.share({title:'My Rise & Run TT finish',text:message,url:location.href});else{await navigator.clipboard.writeText(`${message} ${location.href}`);alert('Finish message and link copied.');}}catch{}};
  actions.append(certificate,share);
}
