import { t, pick } from './locale.js';
import { renderPage, toolLinks, icon, esc, sectionFor, titleFor } from './views.js';
import { normalizePhone, analyzePhone } from './phone-check.js';
import { checkPwnedPassword } from './breach-check.js';
import { getPreference, setPreference, getUser, setUser, getActivities, recordActivity, clearActivities, getQuizResults, recordQuizResult, clearQuizResults, getReports, recordReport, clearReports } from './storage.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let lang=getPreference('language','ar')==='en'?'en':'ar';
let reportCategory='site', suggestedReportPhone='', generated='', quiz={index:0,answers:[],selected:null};
const path=()=>location.pathname.replace(/\/$/,'')||'/';
const demoTools=toolLinks.map(([key,url,ic])=>({key,url,ic}));
const quizItems=[
 {q:['وصلك بريد يطلب الضغط على رابط لتحديث كلمة المرور فورًا. ما الخطوة الأكثر أمانًا؟','You receive an email asking you to click a link to update your password immediately. What is safest?'],a:[['أضغط الرابط وأدخل بياناتي بسرعة','Click the link and enter credentials quickly'],['أفتح الموقع الرسمي بنفسي وأتحقق من التنبيه','Open the official site myself and check for an alert'],['أعيد إرسال الرسالة لأصدقائي','Forward the message to friends']],correct:1,why:['الدخول للموقع الرسمي يدويًا يقلل خطر التصيد والتحويل لموقع مزيف.','Opening the official site yourself reduces phishing and fake-site risk.']},
 {q:['كيف تتعامل مع رمز تحقق وصلك دون أن تطلبه؟','What should you do with a verification code you did not request?'],a:[['أشاركه مع الشخص الذي اتصل بي','Share it with the caller'],['أرسله للدعم عبر رابط في الرسالة','Send it to support through a message link'],['لا أشاركه وأراجع نشاط الحساب من التطبيق الرسمي','Do not share it; review account activity in the official app']],correct:2,why:['رموز التحقق سرية. لا تشاركها وراجع حسابك من التطبيق الرسمي.','Verification codes are secret. Never share them; check your account in the official app.']},
 {q:['ما الأفضل عند إنشاء كلمة مرور لحساب جديد؟','What is best when creating a password for a new account?'],a:[['إعادة كلمة مرور قديمة مع تغيير رقم واحد','Reuse an old password with one changed digit'],['كلمة طويلة وفريدة تُحفظ في مدير موثوق','A long unique password stored in a trusted manager'],['استخدام اسمك وتاريخ ميلادك','Use your name and birthday']],correct:1,why:['الطول والتفرّد يقللان أثر تسرب خدمة أخرى، ومدير كلمات المرور يسهل حفظها.','Length and uniqueness reduce the impact of another service breach; a manager helps store it.']},
 {q:['رأيت خبرًا عاجلًا بلا مصدر واضح. ماذا تفعل؟','You see breaking news with no clear source. What should you do?'],a:[['أشاركه فورًا حتى لا يفوت أحد','Share immediately so no one misses it'],['أبحث عن المصدر الأصلي وتغطية مستقلة قبل المشاركة','Find the original source and independent coverage before sharing'],['أعتبره صحيحًا لأن العنوان حاسم','Assume it is true because the headline is confident']],correct:1,why:['التحقق من المصدر والتغطية المستقلة يساعد على كشف الأخطاء.','Checking the source and independent coverage helps catch errors.']},
 {q:['وجدت شبكة Wi-Fi عامة مفتوحة. ما التصرف الأكثر أمانًا؟','You find an open public Wi-Fi network. What is safest?'],a:[['أدخل بيانات البنك كالمعتاد','Use banking credentials as usual'],['أتجنب العمليات الحساسة أو أستخدم اتصالًا موثوقًا','Avoid sensitive tasks or use a trusted connection'],['أشارك كلمة المرور مع الآخرين','Share my password with others']],correct:1,why:['تجنب إدخال بيانات حساسة على شبكة عامة غير موثوقة.','Avoid entering sensitive data on untrusted public Wi-Fi.']}
];
const iconNameFor={links:'link',news:'news',messages:'message',password:'lock',generator:'key',breach:'shield',search:'search'};
function notify(message,error=false){const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.innerHTML=`<span class="toast-mark">${error?'!':'✓'}</span><span>${esc(message)}</span>`;$('#toast-region').append(el);setTimeout(()=>el.remove(),3200);}
function navMarkup(){const groups=[['home',[['home','/','home']]],['tools',demoTools.map(x=>[x.key,x.url,x.ic])],['learn',[['chat','/chat','chat'],['quiz','/quiz','quiz']]],['space',[['history','/history','history'],['reports','/reports','report'],['about','/about','help']]]];return groups.map(([group,items])=>`<section class="nav-group"><span class="nav-label">${esc(t(group,lang))}</span><div class="nav-list">${items.map(([key,url,ic])=>`<a class="nav-link" href="${url}" data-route="${url}" data-nav-path="${url}"><span class="nav-icon">${icon(ic)}</span><span>${esc(t(key,lang))}</span></a>`).join('')}</div></section>`).join('');}
function setLocale(){
 document.documentElement.lang=lang;
 document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 $$('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n,lang));
 $$('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder,lang));
 $$('[data-i18n-title]').forEach(el=>el.title=t(el.dataset.i18nTitle,lang));
 $('#language-toggle').textContent=lang==='ar'?'EN':'عربي';
 $('#language-toggle').title=lang==='ar'?'Switch to English':'التبديل إلى العربية';
 $('#sidebar').setAttribute('aria-label',lang==='ar'?'التنقل الرئيسي':'Primary navigation');
 $('#mobile-menu').setAttribute('aria-label',lang==='ar'?'فتح القائمة':'Open navigation');
 $('#year').textContent=new Date().getFullYear();
 const desc=$('meta[name="description"]');
 desc.content=lang==='ar'?'درع — بوابة عربية واضحة لفهم إشارات الأمان الرقمي واتخاذ قرار أفضل.':'Der3 — clear Arabic-first guidance for safer digital decisions.';
}
 function updateProfile(){const user=getUser(),name=user?.name||t('guest',lang),initial=[...name][0]||'ض';$('#profile-name').textContent=name;$('#top-profile-name').textContent=name;$('#avatar-initial').textContent=initial;$('#top-avatar').textContent=initial;$('#profile-subtitle').textContent=user?.mode==='account'?(lang==='ar'?'حساب متصل':'Connected account'):user?.mode==='guest'?(lang==='ar'?'جلسة على هذا الجهاز':'Session on this device'):(lang==='ar'?'جلسة ضيف':'Guest session');}
function hydrateIcons(){ $$('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }
function dateLabel(value,withTime=true){const opts=withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'};return new Intl.DateTimeFormat(lang==='ar'?'ar-EG':'en-US',opts).format(new Date(value));}
function hydrateDashboard(){
 const activities=getActivities(),quizzes=getQuizResults(),reports=getReports();
 const quizTypes=['quiz',t('quiz','ar'),t('quiz','en')];
 $('#stat-scans').textContent=activities.filter(item=>!quizTypes.includes(item.type)).length;
 $('#stat-quizzes').textContent=quizzes.length;
 $('#stat-reports').textContent=reports.length;
 $('#stat-tools').textContent=toolLinks.length+2;
 const cards=[...toolLinks,['chat','/chat','chat'],['quiz','/quiz','quiz']];
 $('#tool-cards').innerHTML=cards.map(([key,url,ic])=>`<a class="tool-card" href="${url}" data-route="${url}"><span class="tool-card-icon">${icon(ic)}</span><span class="tool-card-copy"><h3>${esc(t(key,lang))}</h3><p>${esc(t(`${key}Desc`,lang))}</p></span><span class="tool-card-arrow" aria-hidden="true">${lang==='ar'?'←':'→'}</span></a>`).join('');
 const recent=$('#recent-activity');
 recent.innerHTML=activities.length?`<div class="activity-list">${activities.slice(0,4).map(item=>`<div class="activity-item"><span class="activity-dot"></span><div class="activity-item-copy"><strong>${esc(item.title)}</strong><span>${esc(dateLabel(item.createdAt))}</span></div><span class="activity-verdict">${esc(item.verdict||'—')}</span></div>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('history')}</div>${esc(t('noActivity',lang))}</div>`;
}
function hydrateHistory(){
 const activities=getActivities();
 $('#clear-history-button').hidden=!activities.length;
 $('#history-table').hidden=!activities.length;
 $('#history-empty').hidden=Boolean(activities.length);
 $('#history-rows').innerHTML=activities.map(item=>`<tr><td>${esc(dateLabel(item.createdAt))}</td><td>${esc(t(item.type,lang))}</td><td>${esc(item.title)}</td><td>${esc(item.verdict||t('demoResult',lang))}</td></tr>`).join('');
}
function hydrateReports(){
 const reports=getReports(),phone=reportCategory==='phone';
 $('#clear-reports-button').hidden=!reports.length;
 $('#report-list-panel').hidden=!reports.length;
 $('#report-list').innerHTML=reports.slice(0,10).map(item=>`<li><span class="list-check">✓</span><span>${esc(item.title)}<br><small>${esc(dateLabel(item.createdAt,false))}</small></span></li>`).join('');
 $$('[data-report-category]').forEach(button=>button.classList.toggle('selected',button.dataset.reportCategory===reportCategory));
 const label=$('#report-title-label'),input=$('#report-title'),help=$('#report-title-help'),detailsLabel=$('#report-details-label'),details=$('#report-details'),footnote=$('#report-footnote');
 label.textContent=t(phone?'reportPhoneNumber':'reportTitle',lang);
 input.type=phone?'tel':'text'; input.dir=phone?'ltr':'auto'; input.inputMode=phone?'tel':'text'; input.classList.toggle('phone-number-input',phone); input.placeholder=t(phone?'reportPhonePlaceholder':'reportTitleHint',lang); input.value=phone?suggestedReportPhone:'';
 help.textContent=t(phone?'reportPhoneHint':'reportTitleHint',lang);
 detailsLabel.textContent=t(phone?'reportPhoneContext':'reportDetails',lang); details.placeholder=t('reportDetailsHint',lang); details.required=!phone;
 footnote.textContent=t(phone?'reportPhoneHint':'reportHint',lang);
 loadRemoteReports();
}
async function dataApi(action, options={}){
 const response=await fetch(`/api/data/${action}`,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})},...options});
 let payload=null;try{payload=await response.json();}catch{}
 if(!response.ok){const error=new Error(payload?.error||'data_service_error');error.status=response.status;throw error;}
 return payload;
}
function authErrorMessage(error){const key=error?.message==='invalid_credentials'?'invalidCredentials':error?.message==='username_taken'?'usernameTaken':error?.message==='invalid_username'||error?.message==='invalid_password'?'accountInvalid':error?.message==='authentication_required'?'authRequired':'dataServiceError';return t(key,lang);}
async function refreshRemoteUser(){try{const payload=await dataApi('me',{method:'GET',headers:{}});if(payload?.authenticated&&payload.user)setUser({id:payload.user.id,name:payload.user.username,mode:'account'});else if(getUser()?.mode==='account')setUser({name:t('guest',lang),mode:'guest'});updateProfile();}catch{/* Keep the local guest view when the data service is unavailable. */}}
async function loadRemoteReports(){
 const panel=$('#report-list-panel'),list=$('#report-list');if(!panel||!list)return;
 try{const payload=await dataApi('reports',{method:'GET',headers:{}});const reports=Array.isArray(payload?.reports)?payload.reports:[];panel.hidden=!reports.length;list.innerHTML=reports.slice(0,10).map(item=>`<li><span class="list-check">✓</span><span>${esc(item.title)}<br><small>${esc(dateLabel(item.createdAt,false))} · ${esc(item.status)}</small></span></li>`).join('');}
 catch(error){if(error.status===401){panel.hidden=true;return;}panel.hidden=true;}
}
function hydratePage(route){
 hydrateIcons();
 if(route==='/')hydrateDashboard();
 if(route==='/history')hydrateHistory();
 if(route==='/reports')hydrateReports();
 if(route==='/tools/password')addPasswordHistoryButton();
}
let renderSequence=0;
async function render(){
 const sequence=++renderSequence,p=path();
 setLocale();
 $('#primary-nav').innerHTML=navMarkup();
 $('#current-section').textContent=sectionFor(p,lang);
 $('#current-page').textContent=titleFor(p,lang);
 document.title=`${titleFor(p,lang)} — ${lang==='ar'?'درع — بوابة الأمان الرقمي':'Der3 — Digital Safety Hub'}`;
 updateProfile();
 try{
  const content=await renderPage(p);
  if(sequence!==renderSequence)return;
  $('#main-content').innerHTML=content;
  setLocale();
  hydratePage(p);
 }catch{
  if(sequence!==renderSequence)return;
  $('#main-content').innerHTML=`<div class="empty-state">${esc(t('loadPageFailed',lang))}</div>`;
 }
 $$('[data-nav-path]').forEach(a=>a.classList.toggle('active',a.dataset.navPath===p||(p==='/'&&a.dataset.navPath==='/')));
 $('#sidebar').classList.remove('open');
 $('#mobile-menu').setAttribute('aria-expanded','false');
}
function navigate(to){history.pushState({},'',to);if(to==='/quiz')quiz={index:0,answers:[],selected:null};render();window.scrollTo({top:0,behavior:'smooth'});}
function record(type,title,verdict){recordActivity({type,title,verdict});}
function showResult(target,kind,label,title,copy,reasons){const box=$(target);if(!box)return;box.innerHTML=`<section class="tool-result"><div class="result-top"><span class="result-label">${esc(t('resultLabel',lang))}</span><span class="verdict ${kind}">${kind==='safe'?'✓':kind==='danger'?'!':'•'} ${esc(label)}</span></div><h3 class="result-title">${esc(title)}</h3><p class="result-copy">${esc(copy)}</p>${reasons?.length?`<ul class="reason-list">${reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<p class="field-help" style="margin-top:12px">${esc(t('demoResult',lang))}</p></section>`;}
function apiMessage(payload,status){if(status===429||payload?.error==='rate_limited')return t('rateLimitedError',lang);if(status===503||payload?.error==='rate_limit_unavailable')return t('serviceUnavailableError',lang);return payload?.message||payload?.error||`${t('aiError',lang)} (${status})`;}
async function postApi(endpoint,body){
 const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body)});
 let payload=null;try{payload=await response.json();}catch{}
 if(!response.ok)throw new Error(apiMessage(payload,response.status));
 return {payload,status:response.status};
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function scanIdFrom(payload){return payload?.scanId||payload?.providers?.cloudflare?.scanId||payload?.cloudflare?.scanId||'';}
async function pollCloudflare(scanId,target){
 const endpoint=`/api/check/url/${encodeURIComponent(scanId)}`;
 for(let attempt=0;attempt<30;attempt++){
  const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
  let payload=null;try{payload=await response.json();}catch{}
  const status=String(payload?.status||'').toLowerCase();
  if(response.ok&&payload&&response.status!==202&&!['processing','queued','pending','inprogress','running'].includes(status))return payload;
  if(!response.ok&&response.status!==202)throw new Error(apiMessage(payload,response.status));
  target.innerHTML=`<section class="tool-result"><p class="field-help">${esc(t('cloudflarePending',lang))}</p></section>`;
  await wait(Math.min(10000,3000+attempt*250));
 }
 throw new Error(t('cloudflareFailed',lang));
}
function safeHttpUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.toString():'';}catch{return '';}}
function renderSources(sources){
 const list=Array.isArray(sources)?sources:[];
 if(!list.length)return `<p class="field-help">${esc(t('aiNoSources',lang))}</p>`;
 return `<ol class="reason-list">${list.slice(0,12).map(source=>{const url=safeHttpUrl(source?.url||source?.link||'');const title=source?.title||source?.name||url||'Source';return `<li>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`:esc(title)}</li>`;}).join('')}</ol>`;
}
function renderAiResult(target,payload,kind){
 const answer=typeof payload?.answer==='string'?payload.answer.trim():'';
 const sources=kind==='news'?payload?.sources:[];
 target.innerHTML=`<section class="tool-result"><div class="result-top"><span class="result-label">${esc(t('aiAnswer',lang))}</span></div><p class="result-copy" style="white-space:pre-wrap">${esc(answer||t('aiError',lang))}</p>${kind==='news'?`<h3 class="result-title" style="margin-top:16px">${esc(t('aiSources',lang))}</h3>${renderSources(sources)}`:''}</section>`;
}
async function submitCloudflare(raw,target){
 target.innerHTML=`<section class="tool-result"><p class="field-help">${esc(t('cloudflareChecking',lang))}</p></section>`;
 const {payload,status}=await postApi('/api/check/url',{url:raw,mode:'cloudflare',publicScanConsent:true});
 const scanId=scanIdFrom(payload);
 let result=payload?.providers?.cloudflare||payload;
 if(scanId&&(status===202||['queued','processing','pending'].includes(String(result?.status||payload?.status).toLowerCase())))result=await pollCloudflare(scanId,target);
 const verdict=String(result?.verdict||'unclassified').toLowerCase();
 const verdictLabel=verdict==='malicious'?t('cloudflareMalicious',lang):verdict==='not_detected'?t('cloudflareNotSafe',lang):t('cloudflareUnclassified',lang);
 const report=safeHttpUrl(result?.reportUrl||payload?.providers?.cloudflare?.reportUrl);
 const screenshot=scanId?`/api/check/url/${encodeURIComponent(scanId)}/screenshot`:'';
 const redirects=Array.isArray(result?.redirects)?result.redirects:[];
 target.innerHTML=`<section class="tool-result"><div class="result-top"><span class="result-label">${esc(t('cloudflareResult',lang))}</span><span class="verdict ${verdict==='malicious'?'danger':'suspicious'}">${esc(verdictLabel)}</span></div><dl class="result-copy"><dt>${esc(t('cloudflareStatus',lang))}</dt><dd>${esc(result?.status||payload?.status||'—')}</dd><dt>${esc(t('cloudflareVerdict',lang))}</dt><dd>${esc(verdictLabel)}</dd><dt>${esc(t('cloudflareFinalUrl',lang))}</dt><dd dir="ltr">${esc(result?.finalUrl||'—')}</dd></dl>${redirects.length?`<h3 class="result-title">${esc(t('cloudflareRedirects',lang))}</h3><ul class="reason-list">${redirects.slice(0,20).map(url=>`<li dir="ltr">${esc(typeof url==='string'?url:url?.url||'')}</li>`).join('')}</ul>`:''}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">${report?`<a class="button button-secondary button-small" href="${esc(report)}" target="_blank" rel="noopener noreferrer">${esc(t('cloudflareReport',lang))}</a>`:''}${screenshot?`<a class="button button-secondary button-small" href="${screenshot}" target="_blank" rel="noopener noreferrer">${esc(t('cloudflareScreenshot',lang))}</a>`:''}</div><p class="field-help" style="margin-top:12px">${esc(t('publicReportCaveat',lang))}</p></section>`;
 record('links',t('links',lang),verdictLabel);
}
async function submitAiText(endpoint,raw,target,kind){
	target.innerHTML=`<section class="tool-result"><p class="field-help">${esc(t('aiChecking',lang))}</p></section>`;
		const {payload}=await postApi(endpoint,{message:raw,consent:true});
	renderAiResult(target,payload,kind);record(kind,kind==='news'?t('news',lang):t('messages',lang),t('aiAnswer',lang));
}
async function sendChatQuestion(q){
	if($('#chat-consent')?.checked!==true){notify(t('consentRequired',lang),true);return;}
	 const windowEl=$('#chat-window');if(!windowEl)return;
	 appendChat(q,true);const loading=appendChat(t('chatChecking',lang));loading.classList.add('chat-loading');
	 const form=$('#chat-form');if(form)form.setAttribute('aria-busy','true');
	 try{const {payload}=await postApi('/api/ai/chat',{message:q,consent:true});loading.remove();appendChat(payload?.answer||t('chatError',lang));record('chat',t('chatHistoryLabel',lang),t('aiAnswer',lang));}
 catch(error){loading.remove();appendChat(error.message||t('chatError',lang));}
 finally{if(form)form.removeAttribute('aria-busy');windowEl.scrollTop=windowEl.scrollHeight;}
}
function checkLink(raw){let u;try{u=new URL(raw.trim());if(!['http:','https:'].includes(u.protocol))throw Error();}catch{return null;}const value=raw.trim().toLowerCase(),host=u.hostname.toLowerCase(),reasons=[];let kind='safe',label=t('linkSafe',lang);if(u.protocol==='https:')reasons.push(t('secure',lang));else{kind='suspicious';label=t('linkWarn',lang);reasons.push(t('noHttps',lang));}if(/bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd/.test(host)){kind='suspicious';label=t('linkWarn',lang);reasons.push(t('shortUrl',lang));}if(host.includes('xn--')){kind='suspicious';label=t('linkWarn',lang);reasons.push(t('puny',lang));}if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)){kind='danger';label=t('linkBad',lang);reasons.push(t('ip',lang));}if(/login|verify|secure-update|account-check|wallet|password-reset/.test(value)){kind=kind==='danger'?'danger':'suspicious';label=kind==='danger'?t('linkBad',lang):t('linkWarn',lang);reasons.push(t('phishWords',lang));}if(value.length>110||host.split('.').length>4){if(kind==='safe'){kind='suspicious';label=t('linkWarn',lang);}reasons.push(t('longUrl',lang));}return {kind,label,reasons,copy:reasons.length?t('linkAdvice',lang):t('linkSafe',lang)};}
function checkNews(raw){const v=raw.toLowerCase(),r=[];if(/عاجل|صادم|كارث|لن تصدق|حصري|shocking|breaking|unbelievable|urgent/.test(v))r.push(t('newsEmotive',lang));if(/انشر|شارك فور|قبل الحذف|خلال دقائق|share now|before it'?s deleted|forward immediately/.test(v))r.push(t('newsUrgent',lang));if(!/(مصدر|قالت|أعلنت|وكالة|according to|source:|reported by|official)/.test(v))r.push(t('newsNoSource',lang));if(/دائمًا|أبدًا|كل الناس|مؤكد 100|guaranteed|everyone|never fails|100%/.test(v))r.push(t('newsAbsolute',lang));return {kind:r.length?'suspicious':'neutral',label:r.length>1?t('newsCaution',lang):r.length?t('newsNeutral',lang):t('newsPositive',lang),reasons:r.length?r:[t('newsNone',lang)],copy:t('newsAdvice',lang)};}
function checkMessage(raw){const v=raw.toLowerCase(),r=[];if(/خلال \d+|فورًا|حالًا|immediately|within \d+|urgent|act now|تنتهي اليوم|سيتم إيقاف/.test(v))r.push(t('msgUrgent',lang));if(/كلمة المرور|رمز التحقق|كود التحقق|otp|password|login details|credentials|رقم البطاقة/.test(v))r.push(t('msgCred',lang));if(/تحويل|ادفع|رسوم|بطاقة|bank transfer|payment|pay now|wallet/.test(v))r.push(t('msgMoney',lang));if(/https?:\/\/|اضغط|انقر|مرفق|click here|open the link|attachment/.test(v))r.push(t('msgLink',lang));if(/جائزة|فزت|اربح|مكافأة|winner|prize|claim your reward/.test(v))r.push(t('msgPrize',lang));return {kind:r.length?'suspicious':'safe',label:r.length?t('msgRisk',lang):t('msgLow',lang),reasons:r.length?r:[t('msgAdvice',lang)],copy:t('msgAdvice',lang)};}
function passwordRules(v){return {length:v.length>=12,upper:/[A-Z]/.test(v),lower:/[a-z]/.test(v),number:/\d/.test(v),symbol:/[^A-Za-z0-9]/.test(v),unique:!new Set(['password','password123','123456789','qwerty123','letmein','welcome123','admin123']).has(v.toLowerCase())&&!/(.)\1{3,}/.test(v)};}
function updatePassword(){const input=$('#password-value');if(!input)return;const v=input.value,r=passwordRules(v),score=Object.values(r).filter(Boolean).length,bar=$('#strength-bar');bar.style.width=v?`${Math.max(8,score/6*100)}%`:'0';bar.style.background=score<=2?'var(--bad)':score<=3?'var(--warn)':score<=4?'#399a78':'var(--good)';const key=!v?'':score<=1?'passVeryWeak':score<=2?'passWeak':score<=3?'passMedium':score<=4?'passGood':'passStrong';$('#strength-label').textContent=key?t(key,lang):'—';$$('[data-check]').forEach(el=>{const yes=r[el.dataset.check];el.classList.toggle('passed',yes);el.firstElementChild.textContent=yes?'✓':'·';});}
function makePassword(){const groups=[];if($('#gen-upper')?.checked)groups.push('ABCDEFGHJKLMNPQRSTUVWXYZ');if($('#gen-lower')?.checked)groups.push('abcdefghijkmnopqrstuvwxyz');if($('#gen-numbers')?.checked)groups.push('23456789');if($('#gen-symbols')?.checked)groups.push('!@#$%^&*()-_=+[]{}?');if(!groups.length){notify(t('chooseSet',lang),true);return;}if(!crypto?.getRandomValues){notify(t('noCrypto',lang),true);return;}const n=Number($('#gen-length')?.value||18),pool=groups.join(''),pickIndex=max=>{const limit=Math.floor(0x100000000/max)*max;let v;do{const a=new Uint32Array(1);crypto.getRandomValues(a);v=a[0];}while(v>=limit);return v%max;};const out=groups.map(g=>g[pickIndex(g.length)]);while(out.length<n)out.push(pool[pickIndex(pool.length)]);for(let i=out.length-1;i>0;i--){const j=pickIndex(i+1);[out[i],out[j]]=[out[j],out[i]];}generated=out.join('');$('#generated-password').textContent=generated;}
const examples=[
 {title:['دليل حماية الحساب بخطوات بسيطة','A simple guide to account protection'],domain:'learn.example.demo',copy:['مقال توعوي تجريبي عن التحقق بخطوتين وكلمات المرور الفريدة.','Demo awareness article about two-step verification and unique passwords.'],kind:'safe'},
 {title:['تحديث أمني — راجع النطاق الرسمي','Security update — check the official domain'],domain:'notice.example.demo',copy:['مثال محايد. تحقق من الجهة المالكة للموقع قبل إدخال بياناتك.','Neutral example. Verify the organization before entering credentials.'],kind:'suspicious'},
 {title:['اربح الآن! أدخل كلمة مرورك لاستلام الجائزة','Claim now! Enter your password to collect a prize'],domain:'claim-fast.example.demo',copy:['مثال تدريبي على طلب بيانات حساسة مقابل مكافأة غير متوقعة.','Training example of a credential request in exchange for an unexpected reward.'],kind:'danger'}
];
function renderSearch(query){const q=query.toLowerCase().trim(),matches=examples.filter(x=>`${x.title[lang==='en'?1:0]} ${x.copy[lang==='en'?1:0]} ${x.domain}`.toLowerCase().includes(q)||q.split(/\s+/).some(w=>x.copy[lang==='en'?1:0].toLowerCase().includes(w)));return `<div class="search-results">${matches.length?matches.map(x=>`<article class="search-result"><div class="search-result-top"><div><h3>${esc(x.title[lang==='en'?1:0])}</h3><p>${esc(x.copy[lang==='en'?1:0])}</p><div class="result-domain">${esc(x.domain)}</div></div><span class="verdict ${x.kind}">${esc(t(x.kind==='safe'?'searchSafe':x.kind==='danger'?'searchDanger':'searchCaution',lang))}</span></div><p class="field-help">${esc(t('searchResult',lang))}</p></article>`).join(''):`<div class="empty-state">${esc(t('searchNone',lang))}</div>`}</div>`;}
function chatAnswer(text){const v=text.toLowerCase();let key='chatDefault',to='';if(/رابط|لينك|link|url/.test(v)){key='linksTip';to='/tools/links';}else if(/رقم|هاتف|اتصال|phone|caller/.test(v)){key='phoneNoLiveLookup';to='/tools/phone';}else if(/كلمة مرور|باسورد|password/.test(v)){key='passAdvice';to='/tools/password';}else if(/رسالة|تصيد|احتيال|message|phishing|scam/.test(v)){key='msgAdvice';to='/tools/messages';}else if(/خبر|news|مزيف/.test(v)){key='newsAdvice';to='/tools/news';}return {text:t(key,lang),to};}
function appendChat(text,asUser=false){const el=document.createElement('div');el.className=`chat-bubble ${asUser?'user':'assistant'}`;el.textContent=text;$('#chat-window').append(el);$('#chat-window').scrollTop=$('#chat-window').scrollHeight;return el;}
function showQuizQuestion(){const panel=$('#quiz-panel'),q=quizItems[quiz.index];panel.innerHTML=`<div class="section-heading"><div><span class="eyebrow">${esc(t('question',lang))} ${quiz.index+1} / ${quizItems.length}</span><h2 style="font-size:17px;margin:0">${esc(q.q[lang==='en'?1:0])}</h2></div></div><div class="quiz-progress"><span style="width:${quiz.index/quizItems.length*100}%"></span></div><div>${q.a.map((v,i)=>`<button type="button" class="quiz-option${quiz.selected===i?' selected':''}" data-quiz-option="${i}"><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(v[lang==='en'?1:0])}</span></button>`).join('')}</div><div class="quiz-footer"><span>${lang==='ar'?'اختر إجابة واحدة':'Choose one answer'}</span><button class="button button-primary button-small" data-action="quiz-next" ${quiz.selected===null?'disabled':''}>${esc(quiz.index===quizItems.length-1?t('quizShow',lang):t('next',lang))}</button></div>`;}
function finishQuiz(){const score=quiz.answers.reduce((n,a,i)=>n+(a===quizItems[i].correct?1:0),0),pct=Math.round(score/quizItems.length*100),label=t(pct>=80?'quizGreat':pct>=60?'quizOkay':'quizImprove',lang);recordQuizResult({score,total:quizItems.length});record('quiz',`${score}/${quizItems.length}`,label);$('#quiz-panel').innerHTML=`<div class="quiz-result"><div class="quiz-score"><strong>${score}/${quizItems.length}</strong><span>${pct}%</span></div><h2 style="font-size:18px">${esc(label)}</h2><p class="field-help">${esc(t('quizSaved',lang))}</p></div><h3 style="font-size:13px">${lang==='ar'?'مراجعة الإجابات':'Answer review'}</h3><ol class="reason-list">${quizItems.map((item,i)=>`<li>${esc(item.q[lang==='en'?1:0])}<br><strong>${esc(item.a[item.correct][lang==='en'?1:0])}</strong><br>${esc(item.why[lang==='en'?1:0])}</li>`).join('')}</ol><button class="button button-secondary" data-action="quiz-retry" style="margin-top:15px">${esc(t('retry',lang))}</button>`;}
function accountModal(open){$('#account-modal').hidden=!open;if(open)$('#account-form [name="username"]').focus();else $('#account-form').reset();}
function accountTabChange(tab){$$('[data-account-tab]').forEach(b=>b.classList.toggle('active',b.dataset.accountTab===tab));const password=$('#account-form [name="password"]');if(password)password.autocomplete=tab==='signup'?'new-password':'current-password';}
async function submitBreachForm(form){let password=String(new FormData(form).get('check-value')||'');if(!password){notify(t('noInput',lang),true);return;}const input=$('#breach-password'),button=form.querySelector('[type="submit"]'),output=$('#breach-result');button.disabled=true;form.setAttribute('aria-busy','true');output.innerHTML=`<p class="field-help">${esc(t('breachChecking',lang))}</p>`;try{const {count}=await checkPwnedPassword(password),found=count>0,label=found?t('breachFoundBadge',lang):t('breachNotFoundBadge',lang),title=found?t('breachFoundTitle',lang):t('breachNotFoundTitle',lang),copy=found?t('breachFoundText',lang).replace('{count}',new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-US').format(count)):t('breachNotFoundText',lang);output.innerHTML=`<section class="tool-result"><div class="result-top"><span class="result-label">${esc(t('breachResultLabel',lang))}</span><span class="verdict ${found?'danger':'neutral'}">${found?'!':'i'} ${esc(label)}</span></div><h3 class="result-title">${esc(title)}</h3><p class="result-copy">${esc(copy)}</p><p class="field-help" style="margin-top:12px"><a href="https://haveibeenpwned.com/Passwords" target="_blank" rel="noopener noreferrer">${esc(t('breachProvider',lang))}</a></p></section>`;}catch(error){const key=error?.message==='crypto_unavailable'?'breachCryptoError':error?.message==='rate_limited'?'breachRateLimited':'breachServiceError';output.innerHTML=`<section class="tool-result"><p class="verdict suspicious">! ${esc(t('breachErrorBadge',lang))}</p><p class="result-copy" style="margin-top:10px">${esc(t(key,lang))}</p></section>`;}finally{password='';if(input)input.value='';button.disabled=false;form.removeAttribute('aria-busy');}}
function formSubmit(e){const form=e.target;if(!(form instanceof HTMLFormElement))return;e.preventDefault();const data=new FormData(form);
 if(form.id==='breach-form'){submitBreachForm(form);return;}
 if(form.id==='link-form'){const raw=String(data.get('url')||'').trim();if(!raw){notify(t('noInput',lang),true);return;}if(!data.has('publicScanConsent')){notify(t('cloudflareConsent',lang),true);return;}submitCloudflare(raw,$('#link-result')).catch(error=>{$('#link-result').innerHTML=`<section class="tool-result"><p class="result-copy">${esc(error.message||t('cloudflareFailed',lang))}</p></section>`;});return;}
 if(form.id==='news-form'){const raw=String(data.get('claim')||'').trim();if(!raw){notify(t('noInput',lang),true);return;}if(!data.has('aiConsent')){notify(t('consentRequired',lang),true);return;}submitAiText('/api/ai/news',raw,$('#news-result'),'news').catch(error=>{$('#news-result').innerHTML=`<section class="tool-result"><p class="result-copy">${esc(error.message||t('aiError',lang))}</p></section>`;});return;}
 if(form.id==='message-form'){const raw=String(data.get('message')||'').trim();if(!raw){notify(t('noInput',lang),true);return;}if(!data.has('aiConsent')){notify(t('consentRequired',lang),true);return;}submitAiText('/api/ai/message',raw,$('#message-result'),'message').catch(error=>{$('#message-result').innerHTML=`<section class="tool-result"><p class="result-copy">${esc(error.message||t('aiError',lang))}</p></section>`;});return;}
 if(form.id==='phone-form'){const raw=String(data.get('phone')||'').trim(),signals={code:data.has('signal-code'),payment:data.has('signal-payment'),pressure:data.has('signal-pressure'),link:data.has('signal-link')},r=analyzePhone(raw,signals,lang),normalized=normalizePhone(raw);showResult('#phone-result',r.kind,r.label,t('phoneResultTitle',lang),r.copy,r.reasons);if(r.valid){record('phone',t('phoneHistoryLabel',lang),r.label);const reportButton=document.createElement('button');reportButton.type='button';reportButton.className='button button-secondary button-small phone-report-link';reportButton.dataset.action='report-checked-phone';reportButton.dataset.phoneReportNumber=normalized.normalized;reportButton.textContent=t('reportCheckedPhone',lang);$('#phone-result').append(reportButton);}return;}
 if(form.id==='search-form'){const q=String(data.get('query')||'').trim();$('#search-results').innerHTML=renderSearch(q);record('search',t('search',lang),t('demoResult',lang));return;}
 if(form.id==='chat-form'){const q=String(data.get('question')||'').trim();if(!q)return;if(!data.has('chatConsent')){notify(t('consentRequired',lang),true);return;}const input=form.querySelector('[name="question"]');if(input)input.value='';sendChatQuestion(q);return;}
 if(form.id==='report-form'){const title=String(data.get('title')||'').trim(),details=String(data.get('details')||'').trim();if(!getUser()?.id||getUser()?.mode!=='account'){notify(t('authRequired',lang),true);accountModal(true);return;}if(reportCategory==='phone'){const phone=normalizePhone(title);if(!phone?.international){notify(t('reportPhoneInvalid',lang),true);return;}data.set('title',phone.normalized);}else if(!title||details.length<5){notify(t('reportDetailsRequired',lang),true);return;}const reportTitle=reportCategory==='phone'?String(data.get('title')):title;dataApi('reports',{method:'POST',body:JSON.stringify({reportType:reportCategory,title:reportTitle,description:reportCategory==='phone'?details:details,reportedUrl:reportCategory==='site'&&/^https?:\/\//i.test(title)?title:null})}).then(()=>{recordReport({title:reportTitle,category:reportCategory});notify(t('reportSavedRemote',lang));suggestedReportPhone='';reportCategory='site';render();}).catch(error=>{if(error.message==='duplicate_report')notify(t('duplicateReport',lang),true);else notify(authErrorMessage(error),true);});return;}
 if(form.id==='account-form'){const username=String(data.get('username')||'').trim(),password=String(data.get('password')||''),tab=document.querySelector('[data-account-tab].active')?.dataset.accountTab||'login';if(!username||!password){notify(t('accountInvalid',lang),true);return;}dataApi(tab==='signup'?'register':'login',{method:'POST',body:JSON.stringify({username,password})}).then(payload=>{setUser({id:payload.user.id,name:payload.user.username,mode:'account'});accountModal(false);render();notify(t(tab==='signup'?'accountCreated':'accountLoggedIn',lang));}).catch(error=>notify(authErrorMessage(error),true));return;}
}
 function clickAction(e){const route=e.target.closest('[data-route]');if(route){e.preventDefault();navigate(route.dataset.route);return;}const actionElement=e.target.closest('[data-action]'),action=actionElement?.dataset.action;if(action){if(action==='report-checked-phone'){reportCategory='phone';suggestedReportPhone=actionElement.dataset.phoneReportNumber||'';navigate('/reports');return;}if(action==='generate-password')makePassword();if(action==='copy-password'){if(!generated){notify(t('noInput',lang),true);return;}navigator.clipboard?.writeText(generated).then(()=>notify(t('copied',lang))).catch(()=>notify(t('copyFailed',lang),true));}if(action==='clear-history'){if(confirm(t('clearConfirm',lang))){clearActivities();clearQuizResults();render();}}if(action==='clear-reports'){if(confirm(t('clearReportsConfirm',lang))){if(clearReports()){render();notify(t('reportsCleared',lang));}else notify(t('reportsClearFailed',lang),true);}}if(action==='quiz-start'){quiz={index:0,answers:[],selected:null};showQuizQuestion();}if(action==='quiz-next'&&quiz.selected!==null){quiz.answers.push(quiz.selected);if(quiz.index===quizItems.length-1)finishQuiz();else{quiz.index++;quiz.selected=null;showQuizQuestion();}}if(action==='quiz-retry'){quiz={index:0,answers:[],selected:null};showQuizQuestion();}if(action==='close-modal')accountModal(false);if(action==='continue-guest'){setUser({name:t('guest',lang),mode:'guest'});accountModal(false);render();notify(t('guestReady',lang));}if(action==='logout'){dataApi('logout',{method:'POST',body:'{}'}).catch(()=>{}).finally(()=>{setUser({name:t('guest',lang),mode:'guest'});accountModal(false);render();notify(t('accountLoggedOut',lang));});}return;}
 const accountTab=e.target.closest('[data-account-tab]');if(accountTab){accountTabChange(accountTab.dataset.accountTab);return;}const category=e.target.closest('[data-report-category]');if(category){reportCategory=category.dataset.reportCategory;if(reportCategory!=='phone')suggestedReportPhone='';render();return;}const answer=e.target.closest('[data-quiz-option]');if(answer){quiz.selected=Number(answer.dataset.quizOption);$$('[data-quiz-option]').forEach(btn=>btn.classList.toggle('selected',Number(btn.dataset.quizOption)===quiz.selected));const next=$('[data-action="quiz-next"]');if(next)next.disabled=false;return;}const suggestion=e.target.closest('[data-chat-suggestion]');if(suggestion){const query=t(suggestion.dataset.chatSuggestion,lang);sendChatQuestion(query);return;}}
document.addEventListener('click',clickAction);
document.addEventListener('submit',formSubmit);
window.addEventListener('popstate',render);
$('#language-toggle').addEventListener('click',()=>{lang=lang==='ar'?'en':'ar';setPreference('language',lang);render();});
$('#theme-toggle').addEventListener('click',()=>{const dark=document.body.dataset.theme!=='dark';document.body.dataset.theme=dark?'dark':'light';setPreference('theme',dark?'dark':'light');$('#theme-toggle .theme-icon').textContent=dark?'☼':'◐';});
$('#mobile-menu').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#mobile-menu').setAttribute('aria-expanded',String(open));});
$('#profile-button').addEventListener('click',()=>accountModal(true));$('#top-profile').addEventListener('click',()=>accountModal(true));
$('#account-modal').addEventListener('click',e=>{if(e.target.id==='account-modal')accountModal(false);});
document.addEventListener('input',e=>{if(e.target.id==='password-value')updatePassword();if(e.target.id==='gen-length')$('#length-value').textContent=e.target.value;});
const savedTheme=getPreference('theme','light');document.body.dataset.theme=savedTheme;$('#theme-toggle .theme-icon').textContent=savedTheme==='dark'?'☼':'◐';
render();
refreshRemoteUser();

accountTabChange('login');

function addPasswordHistoryButton(){if(path()!=='/tools/password'||$('#save-password-score'))return;const slot=$('#password-history-button');if(!slot)return;const button=document.createElement('button');button.id='save-password-score';button.type='button';button.className='button button-secondary button-small';button.dataset.action='save-password-score';button.style.marginTop='14px';button.textContent=lang==='ar'?'حفظ ملخص القوة في السجل':'Save strength summary to history';slot.append(button);}
addPasswordHistoryButton();
document.addEventListener('click',event=>{if(!event.target.closest('[data-action="save-password-score"]'))return;const value=$('#password-value')?.value||'';if(!value){notify(t('noInput',lang),true);return;}const checks=passwordRules(value),score=Object.values(checks).filter(Boolean).length,label=t(score<=1?'passVeryWeak':score<=2?'passWeak':score<=3?'passMedium':score<=4?'passGood':'passStrong',lang);record('password',`${lang==='ar'?'تقييم قوة كلمة السر':'Password strength assessment'} (${score}/6)`,label);notify(lang==='ar'?'حُفظ ملخص القوة فقط؛ لم تُحفظ كلمة السر.':'Strength summary saved; the password itself was not saved.');});
