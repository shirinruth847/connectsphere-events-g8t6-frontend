// Runs against locally started frontend/backend and existing synthetic seeds.
// Does not create/reset users. Removes only this run's event data; append-only
// audit records remain attached to the existing seed organiser by design.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const { chromium } = require('@playwright/test');
const appRoot = path.resolve(__dirname, '..');
const backendRoot = process.env.CONNECTSPHERE_BACKEND_DIR || path.resolve(appRoot, '../../connectsphere-events-g8t6-backend');
require(path.join(backendRoot,'node_modules/dotenv')).config({path:path.join(backendRoot,'.env')});
const supabase = require(path.join(backendRoot,'config/supabase'));
const base = process.env.LIVE_FRONTEND_URL || 'http://localhost:3000';
const api = process.env.LIVE_BACKEND_URL || 'http://localhost:8000';
const runId = 'repair-'+Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex');
const ids = new Set(); const checks = []; let browser; let users = [];
const output = path.join(appRoot, 'test-results/live-acceptance.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
function record(name, details={}) { const result={name,...details}; checks.push(result); console.log(JSON.stringify(result)); }
function assert(condition,message){if(!condition)throw new Error(message);}
function check(result){if(result.error)throw new Error(result.error.message);return result.data;}
// SPM-173 lifecycle rows the backend role may not delete (safety rounds,
// confirmation snapshots) go through the privileged test connection; the run's
// booking, room and venue go before the events they reference.
const lifecycle={eventIds:[],venueIds:[],roomIds:[],bookingIds:[]};
async function cleanupLifecycle() {
 if(lifecycle.eventIds.length){
  const {Client}=require(path.join(backendRoot,'node_modules/pg'));const client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();
  try{
   await client.query('BEGIN');
   await client.query('DELETE FROM public.notification_recipient WHERE notification_id IN (SELECT notification_id FROM public.notification WHERE event_id = ANY($1::integer[]))',[lifecycle.eventIds]);
   await client.query('DELETE FROM public.notification WHERE event_id = ANY($1::integer[])',[lifecycle.eventIds]);
   await client.query('DELETE FROM public.safety_reviews WHERE event_id = ANY($1::integer[])',[lifecycle.eventIds]);
   await client.query('DELETE FROM public.event_confirmation_snapshots WHERE event_id = ANY($1::integer[])',[lifecycle.eventIds]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
 }
 for(const [table,key,values] of [['venue_booking','booking_id',lifecycle.bookingIds],['room','room_id',lifecycle.roomIds],['venue','venue_id',lifecycle.venueIds]]) {
  if(!values.length)continue;const result=await supabase.from(table).delete().in(key,values);if(result.error)throw new Error('Cleanup '+table+': '+result.error.message);
 }
}
async function cleanup() {
 await cleanupEquipment();
 if(ids.size){
  const data=check(await supabase.from('event').select('event_id,title,organiser_id').in('event_id',[...ids]));
  assert(data.length===ids.size&&data.every(row=>row.title.startsWith(runId)&&users.some(user=>user.user_id===row.organiser_id)), 'Refusing to clean non-fixture events');
 }
 assert(lifecycle.eventIds.every(eventId=>ids.has(eventId)), 'Refusing to clean lifecycle rows without a registered event fixture');
 await cleanupLifecycle();
 if(!ids.size)return;
 for(const table of ['notification','event_assignments','event_venue_preference','event_equipment_requirement','event']) {
  const result=await supabase.from(table).delete().in('event_id',[...ids]); if(result.error)throw new Error('Cleanup '+table+': '+result.error.message);
 }
 const remaining=check(await supabase.from('event').select('event_id').in('event_id',[...ids]));
 assert(remaining.length===0,'Live event cleanup incomplete');record('live event cleanup',{removedEvents:ids.size});
}
async function login(page,user) {
 await page.goto(base+'/login');await page.locator('#email').fill(user.email);await page.locator('#password').fill(process.env.SEED_ACCOUNT_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(url=>['/dashboard','/events'].includes(url.pathname));
 await page.getByRole('button',{name:'Logout',exact:true}).waitFor();
}
// SPM-44 attendee discovery. Read-only: no event data is created. The backend
// decides visibility, so the cards are compared with its responses, not with a
// lifecycle rule repeated here.
const SAFE_DISCOVERY_FIELDS='description,endDatetime,eventId,location,organisationName,registrationAvailability,startDatetime,title';
let visibleDiscoveryEventId=null;
const workspaceReads=(requests)=>requests.filter(url=>/^\/api\/events\/\d+(\/|$)/.test(url));
async function verifyAttendeeDiscovery(page,requests) {
 const firstResponse=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/events/discovery'&&!u.searchParams.has('cursor');});
 // Attendees already land here after login; reload so the first page is requested again.
 await page.goto(base+'/events');
 const first=await firstResponse;assert(first.status()===200,'Discovery list returned '+first.status());
 const page1=await first.json();
 await page.getByRole('heading',{name:'Event Discovery',exact:true,level:1}).waitFor();
 if(page1.events.length===0) {
  await page.getByRole('heading',{name:'No events are available at the moment.',exact:true}).waitFor();
  record('SPM-44 live discovery empty state',{events:0});return;
 }
 for(const event of page1.events) assert(Object.keys(event).sort().join(',')===SAFE_DISCOVERY_FIELDS,'Discovery returned non attendee-safe fields: '+Object.keys(event).join(','));
 const cards=page.getByRole('article');await cards.first().waitFor();
 assert(await cards.count()===page1.events.length,'Card count does not match the discovery response');
 const titles=await page.locator('article h3').allInnerTexts();
 assert(JSON.stringify(titles)===JSON.stringify(page1.events.map(e=>e.title)),'Cards are not the backend events in backend order');
 let loaded=[...page1.events];
 if(page1.nextCursor) {
  const moreResponse=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/events/discovery'&&u.searchParams.get('cursor')===page1.nextCursor;});
  await page.getByRole('button',{name:'Load more events',exact:true}).click();
  const more=await moreResponse;assert(more.status()===200,'Load more returned '+more.status());
  const page2=await more.json();loaded=loaded.concat(page2.events.filter(e=>!loaded.some(x=>x.eventId===e.eventId)));
  await page.waitForFunction(count=>document.querySelectorAll('main article').length===count,loaded.length);
  const ids=await page.locator('article h3').evaluateAll(els=>els.map(e=>e.id));
  assert(new Set(ids).size===ids.length,'Duplicate cards after Load more');
  record('SPM-44 live load more uses nextCursor',{firstPage:page1.events.length,total:loaded.length});
 }
 record('SPM-44 live discovery cards match backend',{cards:loaded.length,availability:[...new Set(loaded.map(e=>e.registrationAvailability))].sort()});
 const target=loaded[0];visibleDiscoveryEventId=target.eventId;
 const detailResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/events/discovery/'+target.eventId);
 await page.getByRole('button',{name:'View event details for '+target.title,exact:true}).click();
 assert((await detailResponse).status()===200,'Discovery detail failed');
 await page.getByRole('dialog',{name:target.title,exact:true}).getByText('Date',{exact:true}).waitFor();
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.goto(base+'/events/'+target.eventId);
 await page.getByRole('heading',{name:target.title,exact:true,level:1}).waitFor();
 record('SPM-44 live details via discovery/:id',{eventId:target.eventId});
 // Hidden events: one unpublished and one published in an ineligible state.
 // PREPARATION remains attendee-visible alongside CONFIRMED (Master 5.3).
 const hidden=[
  check(await supabase.from('event').select('event_id').eq('is_published',false).neq('status','DRAFT').limit(1)),
  check(await supabase.from('event').select('event_id').eq('is_published',true).not('status','in','(CONFIRMED,PREPARATION)').limit(1)),
 ].flat().map(row=>row.event_id);
 for(const id of hidden) {
  const res=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/events/discovery/'+id);
  await page.goto(base+'/events/'+id);assert((await res).status()===404,'Hidden event '+id+' was not 404');
  await page.getByRole('heading',{name:'This event is not available',exact:true}).waitFor();
 }
 record('SPM-44 live hidden events show not available',{checked:hidden.length});
 assert(workspaceReads(requests).length===0,'Attendee UI called GET /api/events/:id: '+workspaceReads(requests).join(', '));
 record('SPM-44 live attendee never reads the staff event endpoint',{discoveryRequests:requests.filter(u=>u.startsWith('/api/events/discovery')).length});
}
async function verifyDiscoveryDenied(page,role,requests,token) {
 const res=await fetch(api+'/api/events/discovery',{headers:{Authorization:'Bearer '+token}});
 assert(res.status===403,role+' discovery API returned '+res.status);
 if(role!=='COORDINATOR_LEAD') {
  await page.goto(base+'/events');
  await page.getByText('This page is not available for your role.',{exact:false}).waitFor();
 }
 assert(!requests.some(u=>u.startsWith('/api/events/discovery')),role+' UI called attendee discovery');
 record('SPM-44 live wrong role denied discovery',{role,api:res.status});
}
async function verifySignedOutRedirectBack(user) {
 if(!visibleDiscoveryEventId)return;
 const context=await browser.newContext({timezoneId:'Asia/Singapore'});const page=await context.newPage();
 try {
  const target='/events/'+visibleDiscoveryEventId;
  await page.goto(base+target);await page.waitForURL(url=>url.pathname==='/login');
  assert(new URL(page.url()).searchParams.get('next')===target,'Login lost the event return path');
  await page.locator('#email').fill(user.email);await page.locator('#password').fill(process.env.SEED_ACCOUNT_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL(url=>url.pathname===target);
  await page.getByRole('heading',{name:'Event information',exact:true}).waitFor();
  record('SPM-44 live signed-out event URL returns after login',{path:target});
 } finally {await context.close();}
}
async function next(page){await page.getByRole('button',{name:'Next',exact:true}).click();}
async function complete(page,title) {
 await page.locator('#title').fill(title);await page.locator('#purpose').fill('Completed-ticket baseline acceptance');await page.locator('#description').fill('Synthetic live verification; removed after this run.');await next(page);
 const start=new Date(Date.now()+7*86400000);const end=new Date(start.getTime()+7200000);
 await page.locator('#startDatetime').fill(start.toISOString().slice(0,16));await page.locator('#endDatetime').fill(end.toISOString().slice(0,16));await page.locator('#expectedAttendance').fill('25');await next(page);
 const venues=page.locator('input[type=checkbox]');if(await venues.count())await venues.first().check();
 const layout=page.locator('#layout');if(await layout.locator('option[value="THEATRE"]').count())await layout.selectOption('THEATRE');
 await next(page);await page.locator('#accessibilityNotes').fill('Wheelchair access requested.');await next(page);await next(page);
 await page.getByRole('heading',{name:'Registration & Ticketing Needs',exact:true}).waitFor();
 await page.getByLabel('Enable event registration').check();await page.locator('#registrationCapacity').fill('30');
}
// ---------- SPM-243 Safety Officer review through the real UI and API ----------
const reviewStep=async(page,title)=>{await page.getByRole('navigation',{name:'Review steps'}).getByRole('button',{name:new RegExp(title)}).click();await page.getByRole('heading',{name:title,level:2}).waitFor();};
const assessFactor=async(page,label,result,comment)=>{const group=page.getByRole('group',{name:label,exact:true});await group.getByRole('radio',{name:result,exact:true}).check();if(comment)await group.getByRole('textbox').fill(comment);};
// A cold MongoDB connection can briefly report venue detail as unavailable; press
// the panel's own Retry once, as an officer would, before failing the run.
async function waitForVenueDetail(page,text) {
 const detail=page.getByText(text,{exact:true});const unavailable=page.getByText('Emergency access and known restrictions could not be loaded',{exact:false});
 await detail.or(unavailable).first().waitFor();
 if(await unavailable.isVisible()){await page.getByRole('button',{name:'Retry',exact:true}).click();await detail.waitFor();}
}
async function assessAllFactors(page) {
 await reviewStep(page,'Attendance & schedule');await assessFactor(page,'Attendance and capacity','Satisfactory');
 await reviewStep(page,'Venues & layout');await assessFactor(page,'Layout','Satisfactory');await assessFactor(page,'Emergency access','Satisfactory');
 await assessFactor(page,'Known venue restrictions','Not applicable','No venue safety record; nothing known restricts this event.');
 await reviewStep(page,'Accessibility & equipment');await assessFactor(page,'Accessibility','Not applicable','No accessibility needs requested.');await assessFactor(page,'Equipment placement','Not applicable','No equipment requested.');
}
async function recordSafetyDecision(page) {
 await reviewStep(page,'Decision');await page.getByRole('region',{name:'Review actions'}).getByRole('button',{name:'Record decision'}).click();
 await page.getByRole('dialog',{name:'Record this decision?'}).getByRole('button',{name:'Record decision'}).click();await page.getByText('Safety decision recorded',{exact:true}).waitFor();
}
async function claimFromQueue(page,title) {
 await page.goto(base+'/dashboard');const card=page.getByRole('region',{name:'Awaiting review'}).getByRole('article',{name:title});await card.waitFor();
 await card.getByRole('button',{name:'Claim'}).click();await page.getByText('Review claimed',{exact:true}).waitFor();
 await page.getByRole('region',{name:'My reviews'}).getByRole('article',{name:title}).getByRole('link',{name:'Continue review'}).click();
 await page.getByText('Claimed by you',{exact:true}).waitFor();
}
async function safetyOfficerReview({eventId,title,coordinator,organiser,coordinatorPage,coordinatorPanel,state}) {
 const officer=users.find(user=>user.role==='SAFETY_OFFICER');assert(officer,'Missing seed Safety Officer');
 const rounds=async()=>check(await supabase.from('safety_reviews').select('review_id,round_number,status,claimed_by,checklist,requested_changes,decided_by,organiser_comment,internal_notes').eq('event_id',eventId).order('round_number'));
 const coordinatorNotices=async()=>check(await supabase.from('notification').select('notification_id,notification_recipient!inner(recipient_id)').eq('event_id',eventId).eq('notification_recipient.recipient_id',coordinator.user_id)).length;
 const context=await browser.newContext({timezoneId:'Asia/Singapore'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await login(page,officer);await page.getByRole('heading',{name:'Safety Officer dashboard',exact:true}).waitFor();
  await claimFromQueue(page,title);
  let [round]=await rounds();assert(round.claimed_by===officer.user_id,'Claim was not recorded');
  record('SPM-243 queue, claim and open the review',{eventId,reviewId:round.review_id});

  await reviewStep(page,'Venues & layout');await waitForVenueDetail(page,'No venue safety record exists for this venue.');
  await reviewStep(page,'Attendance & schedule');await page.getByText('participant details are not shown',{exact:false}).waitFor();
  await assessFactor(page,'Attendance and capacity','Satisfactory');await page.getByRole('button',{name:'Save progress'}).click();await page.getByText('Progress saved',{exact:true}).waitFor();
  [round]=await rounds();assert(round.checklist?.attendanceCapacity?.result==='SATISFACTORY','Progress was not saved');
  await page.reload();await page.getByRole('group',{name:'Attendance and capacity',exact:true}).getByRole('radio',{name:'Satisfactory',exact:true}).waitFor();
  assert(await page.getByRole('group',{name:'Attendance and capacity',exact:true}).getByRole('radio',{name:'Satisfactory',exact:true}).isChecked(),'Saved progress was not restored');
  record('SPM-243 panel data, MongoDB venue detail and saved progress',{eventId});

  await page.getByRole('button',{name:'Hand back to the queue'}).click();const handBack=page.getByRole('dialog',{name:'Hand this review back?'});
  await handBack.getByRole('textbox').fill(runId+' live hand-back check');await handBack.getByRole('button',{name:'Hand back',exact:true}).click();await page.getByText('Review handed back',{exact:true}).waitFor();
  [round]=await rounds();assert(round.claimed_by===null&&round.checklist===null&&round.status==='OPEN','Hand-back did not clear the claim and progress');
  record('SPM-243 hand back clears the claim and progress',{eventId});

  await page.getByRole('button',{name:'Claim this review'}).click();await page.getByText('Claimed by you',{exact:true}).waitFor();
  await assessAllFactors(page);await reviewStep(page,'Decision');await page.getByRole('radio',{name:/Request changes/}).check();
  await page.getByRole('textbox',{name:'Change 1',exact:true}).fill('Add two stewards at the main exit');await page.getByRole('button',{name:'Add a change'}).click();await page.getByRole('textbox',{name:'Change 2',exact:true}).fill('Mark the accessible route on the floor plan');
  const noticesBefore=await coordinatorNotices();await recordSafetyDecision(page);
  [round]=await rounds();assert(round.status==='CHANGES_REQUESTED'&&round.requested_changes.length===2&&round.decided_by===officer.user_id,'Changes were not recorded');
  assert(await state()==='PLANNING','Requested changes did not return the event to PLANNING');assert(await coordinatorNotices()>noticesBefore,'Coordinator not notified of the outcome');
  record('SPM-243 request changes returns the event to planning and notifies the coordinator',{eventId,reviewId:round.review_id});

  // Forbidden, conflict and error paths against the real API with the officer's own token.
  const token=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>/^sb-.*-auth-token$/.test(key));return key?JSON.parse(localStorage.getItem(key)).access_token:null;});
  const call=async(method,path,body,headers={})=>{const response=await fetch(api+'/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json().catch(()=>({}))};};
  const reclaim=await call('POST',`/safety-reviews/${round.review_id}/claim`,{});assert(reclaim.status===409&&reclaim.body.code==='ROUND_NOT_CLAIMABLE','Decided round could be claimed: '+reclaim.status);
  const keyless=await call('POST',`/safety-reviews/${round.review_id}/decision`,{outcome:'APPROVED'});assert(keyless.status===400&&keyless.body.fields?.idempotencyKey,'Decision without Idempotency-Key was not refused');
  const edit=await call('PUT',`/events/${eventId}`,{title:'x',version:1},{'Idempotency-Key':crypto.randomUUID()});assert(edit.status===403,'Safety Officer could edit the event: '+edit.status);
  const outside=check(await supabase.from('event').select('event_id').neq('event_id',eventId).neq('status','DRAFT').limit(1).single());
  const unrelated=await call('GET',`/events/${outside.event_id}`);assert(unrelated.status===404,'Unrelated event visible to the Safety Officer: '+unrelated.status);
  await page.goto(base+'/events/'+outside.event_id);await page.getByText('Event not available',{exact:true}).waitFor();
  record('SPM-243 conflict, validation and forbidden paths',{reclaim:reclaim.status,missingKey:keyless.status,edit:edit.status,unrelatedEvent:unrelated.status});

  // The coordinator sees the requested changes and resubmits; a second round opens.
  await coordinatorPage.reload();const section=coordinatorPage.getByRole('region',{name:'Safety review'});await section.getByText('Add two stewards at the main exit',{exact:true}).waitFor();
  await coordinatorPanel.getByText('Ready',{exact:true}).waitFor();await coordinatorPanel.getByRole('button',{name:'Submit for safety review'}).click();await coordinatorPanel.getByRole('button',{name:'Confirm event'}).waitFor();
  const reopened=await rounds();assert(reopened.length===2&&reopened[1].status==='OPEN','Resubmission did not open round 2');
  record('SPM-251 coordinator sees requested changes and resubmits',{eventId,round:2});

  await claimFromQueue(page,title);await assessAllFactors(page);await reviewStep(page,'Decision');await page.getByRole('radio',{name:/Approve/}).check();
  await page.getByLabel('Comment for the organiser').fill(runId+' arrangements are safe');await page.getByLabel(/Internal notes/).fill(runId+' staff-only note');
  await recordSafetyDecision(page);await page.getByText('Decided · read-only',{exact:true}).waitFor();
  const approved=(await rounds())[1];assert(approved.status==='APPROVED'&&approved.decided_by===officer.user_id,'Approval was not recorded');assert(await state()==='SAFETY_REVIEW','Approval moved the event out of SAFETY_REVIEW');
  await page.setViewportSize({width:390,height:844});await reviewStep(page,'Venues & layout');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Review page scrolls sideways at 390px');
  record('SPM-243 approval keeps SAFETY_REVIEW; review fits 390px',{eventId,reviewId:approved.review_id});
  assert(errors.length===0,'Safety Officer browser error: '+errors.join('; '));
 } finally {await context.close();}

 // The organiser sees outcomes and their comment, never internal notes or the checklist.
 const organiserContext=await browser.newContext({timezoneId:'Asia/Singapore'});const organiserPage=await organiserContext.newPage();
 try {
  await login(organiserPage,organiser);await organiserPage.goto(base+'/events/'+eventId);const section=organiserPage.getByRole('region',{name:'Safety review'});
  await section.getByText(runId+' arrangements are safe',{exact:true}).waitFor();
  assert(await section.getByRole('article').count()===2,'Organiser does not see both rounds');
  assert(await section.getByText(runId+' staff-only note').count()===0&&await section.getByText('Internal notes').count()===0&&await section.getByText('Checklist').count()===0,'Organiser sees staff-only review detail');
  record('SPM-251 organiser sees outcomes and organiser comments only',{eventId});
 } finally {await organiserContext.close();}
}

// SPM-173 readiness, submission, confirmation and preparation through the real
// coordinator UI and backend. Venue decisions are seeded directly because SPM-186
// has no UI yet; the safety review goes through the real Safety Officer (SPM-243).
async function coordinatorLifecycle(page,coordinator) {
 assert(process.env.TEST_DATABASE_URL,'TEST_DATABASE_URL is needed to clean up the lifecycle flow');
 const organiser=users.find(user=>user.role==='ORGANISER');const venueStaff=users.find(user=>user.role==='VENUE_STAFF');assert(organiser&&venueStaff,'Missing seed organiser or Venue Staff');
 const venue=check(await supabase.from('venue').insert({name:runId+' Hall',address:runId+' 1 Live Road',max_capacity:200}).select('venue_id').single());lifecycle.venueIds.push(venue.venue_id);
 const room=check(await supabase.from('room').insert({venue_id:venue.venue_id,layout_type:'THEATRE',capacity:200}).select('room_id').single());lifecycle.roomIds.push(room.room_id);
 // A far-future slot of its own, so the seed coordinator's schedule never overlaps (SPM-174 guard).
 const start=new Date(Date.UTC(2029,0,1)+crypto.randomInt(0,300)*86400000+crypto.randomInt(0,20)*3600000);const end=new Date(start.getTime()+7200000);
 const event=check(await supabase.from('event').insert({title:runId+' lifecycle',purpose:'SPM-173 live lifecycle check',description:'Synthetic live verification; removed after this run.',organiser_id:organiser.user_id,coordinator_id:coordinator.user_id,status:'PLANNING',expected_attendance:50,start_datetime:start.toISOString(),end_datetime:end.toISOString(),preferred_layout_type:'THEATRE'}).select('event_id').single());
 ids.add(event.event_id);lifecycle.eventIds.push(event.event_id);
 const booking=check(await supabase.from('venue_booking').insert({event_id:event.event_id,room_id:room.room_id,requested_by:coordinator.user_id,start_datetime:start.toISOString(),end_datetime:end.toISOString(),status:'PENDING'}).select('booking_id').single());lifecycle.bookingIds.push(booking.booking_id);
 const state=async()=>check(await supabase.from('event').select('status').eq('event_id',event.event_id).single()).status;
 const panel=page.locator('section[aria-labelledby="lifecycle-heading"]');

 await page.goto(base+'/events/'+event.event_id);await panel.getByText('Not ready yet').waitFor();await panel.getByText('Every venue booking must be approved',{exact:false}).waitFor();
 assert(await panel.getByRole('button',{name:'Submit for safety review'}).isDisabled(),'Submit offered while not ready');
 record('SPM-173 readiness names the pending booking',{eventId:event.event_id});

 // Stands in for Venue Staff approving the booking (SPM-186).
 check(await supabase.from('venue_booking').update({status:'APPROVED',reviewed_by:venueStaff.user_id}).eq('booking_id',booking.booking_id).select('booking_id'));
 await page.reload();await panel.getByText('Ready',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Submit for safety review'}).click();await panel.getByRole('button',{name:'Confirm event'}).waitFor();
 assert(await state()==='SAFETY_REVIEW','Submit did not enter SAFETY_REVIEW');
 const round=check(await supabase.from('safety_reviews').select('review_id,status').eq('event_id',event.event_id).single());assert(round.status==='OPEN','No open safety round');
 record('SPM-173 submit for safety review',{eventId:event.event_id,reviewId:round.review_id});

 await panel.getByRole('button',{name:'Confirm event'}).click();await panel.getByText('needs a safety approval',{exact:false}).waitFor();
 assert(await state()==='SAFETY_REVIEW','Confirmed without a safety approval');
 record('SPM-173 confirm refused before safety approval',{eventId:event.event_id});

 // SPM-243: the seed Safety Officer requests changes, the coordinator resubmits, then the officer approves.
 await safetyOfficerReview({eventId:event.event_id,title:runId+' lifecycle',coordinator,organiser,coordinatorPage:page,coordinatorPanel:panel,state});
 await page.reload();await panel.getByRole('button',{name:'Confirm event'}).click();await panel.getByRole('button',{name:'Start preparation'}).waitFor();
 assert(await state()==='CONFIRMED','Confirm did not enter CONFIRMED');
 const snapshot=check(await supabase.from('event_confirmation_snapshots').select('snapshot').eq('event_id',event.event_id).single());assert(snapshot.snapshot.primary_venue?.venue_id===venue.venue_id,'Snapshot lacks the primary venue');
 const notices=check(await supabase.from('notification').select('title,notification_recipient(recipient_id)').eq('event_id',event.event_id));
 assert(notices.some(n=>n.title==='Event confirmed'&&n.notification_recipient.some(r=>r.recipient_id===organiser.user_id)),'Owner not notified of the confirmation');
 record('SPM-173 confirm with snapshot and owner notification',{eventId:event.event_id});

 const started=page.waitForResponse(r=>r.url()===`${api}/api/events/${event.event_id}/start-preparation`&&r.request().method()==='POST');
 await panel.getByRole('button',{name:'Start preparation'}).click();const startResponse=await started;
 assert(startResponse.status()===200,'Start preparation refused: '+JSON.stringify(await startResponse.json().catch(()=>null)));
 assert(await state()==='PREPARATION','Start preparation did not enter PREPARATION');
 record('SPM-173 start preparation',{eventId:event.event_id});
}
// SPM-52 equipment catalogue against the real backend, Supabase and Atlas.
// Items are named with the run ID and removed by cleanupEquipment: the MongoDB
// document first (Master 10.4), then unavailable stock, outbox entries and the
// item through the privileged test connection. Activity entries stay, as the
// audit log is append-only.
const equipmentIds = new Set();
const until = async (probe, message, timeout = 15000) => {
 const end = Date.now() + timeout;
 for (;;) {
  if (await probe()) return;
  if (Date.now() > end) throw new Error(message);
  await new Promise((resolve) => setTimeout(resolve, 250));
 }
};
const bearerToken = (page) => page.evaluate(() => { const key = Object.keys(localStorage).find((name) => /^sb-.*-auth-token$/.test(name)); return key ? JSON.parse(localStorage.getItem(key)).access_token : null; });
const equipmentApi = async (token, pathname) => { const res = await fetch(api + '/api/equipment' + pathname, { headers: { Authorization: 'Bearer ' + token } }); return { status: res.status, body: await res.json().catch(() => ({})) }; };
// The period wording the backend uses, in Singapore time.
const sgDate = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const sgDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' });
const equipmentActions = async (equipmentId) => check(await supabase.from('activity_log').select('action').eq('entity_name', 'equipment').eq('entity_id', equipmentId).order('log_id')).map((row) => row.action);

async function verifyEquipmentCatalogue(page, context, user) {
 const token = await bearerToken(page);
 const rows = page.getByRole('list', { name: 'Equipment' }).getByRole('listitem');
 const name = runId + ' Laser Projector';
 const category = runId + ' Visual';

 // Open Equipment from the tab: the list comes from the real API.
 const listed = page.waitForResponse((r) => r.url().startsWith(api + '/api/equipment?') || r.url() === api + '/api/equipment');
 await page.getByRole('link', { name: 'Equipment', exact: true }).first().click();
 await page.waitForURL((url) => url.pathname === '/equipment');
 assert((await listed).status() === 200, 'Equipment list did not load');
 await page.getByRole('heading', { level: 1, name: 'Equipment' }).waitFor();
 record('SPM-52 live Equipment tab opens the catalogue', { role: user.role });

 // TC-01: create; Details pending turns Active once the detail document is applied.
 await page.getByRole('button', { name: 'Add equipment' }).first().click();
 await page.locator('#create-equipment-name').fill(name);
 await page.locator('#create-equipment-category').fill(category);
 await page.locator('#create-equipment-storageLocation').fill('Store Room B');
 await page.locator('#create-equipment-totalQuantity').fill('5');
 await page.locator('#create-equipment-specifications').fill('Live check: 4K, 5000 lm');
 const createResponse = page.waitForResponse((r) => r.url() === api + '/api/equipment' && r.request().method() === 'POST');
 await page.getByRole('button', { name: 'Save equipment' }).click();
 const created = await createResponse;
 const createdBody = await created.json();
 assert(created.status() === 201 && createdBody.equipment?.name === name, 'Create returned ' + created.status());
 const equipmentId = createdBody.equipment.equipmentId;
 equipmentIds.add(equipmentId);
 fs.writeFileSync(output, JSON.stringify({ runId, createdEventIds: [...ids], createdEquipmentIds: [...equipmentIds], checks }, null, 2));
 await page.getByText('“' + name + '” was created', { exact: false }).waitFor();
 let detailStatus = null;
 await until(async () => { const { body } = await equipmentApi(token, '/' + equipmentId); detailStatus = body.equipment?.detailStatus; return body.equipment?.status === 'ACTIVE' && detailStatus === 'CURRENT'; }, 'Item stayed Details pending (detail never applied to MongoDB)', 45000);
 const stored = check(await supabase.from('equipment').select('created_by,version,details_pending,is_active').eq('equipment_id', equipmentId).single());
 assert(stored.created_by === user.user_id && stored.version === 1 && !stored.details_pending && stored.is_active, 'Created row is not as expected');
 const entries = check(await supabase.from('outbox_entries').select('state,pg_version').eq('target_collection', 'equipment_details').eq('document_id', String(equipmentId)));
 assert(entries.length === 1 && entries[0].state === 'APPLIED', 'Outbox entry was not applied');
 const { getMongoDb } = require(path.join(backendRoot, 'config/mongodb'));
 const document = await (await getMongoDb()).collection('equipment_details').findOne({ _id: String(equipmentId) });
 assert(document && document.pg_version === 1 && document.specifications === 'Live check: 4K, 5000 lm' && document.name === name, 'MongoDB document missing or wrong');
 assert(JSON.stringify(await equipmentActions(equipmentId)) === JSON.stringify(['EQUIPMENT_CREATED']), 'Create activity entry missing');
 record('SPM-52 live TC-01 create applies the detail and turns Active', { equipmentId, outbox: 'APPLIED', mongoPgVersion: document.pg_version });

 // TC-16: search, category and status filters, then clear.
 await page.locator('#equipment-search').fill(runId);
 await until(async () => (await rows.count()) === 1 && (await rows.first().innerText()).includes(name), 'Search did not narrow to the new item');
 await page.locator('#equipment-category').selectOption(category);
 await until(async () => (await rows.count()) === 1, 'Category filter did not keep the new item');
 await page.getByRole('button', { name: 'Inactive', exact: true }).click();
 await page.getByText('No equipment matches these filters', { exact: true }).waitFor();
 await page.getByRole('button', { name: 'Active', exact: true }).click();
 await until(async () => (await rows.count()) === 1, 'Active filter did not show the new item');
 await page.getByRole('button', { name: 'Clear filters' }).first().click();
 await until(async () => (await page.locator('#equipment-search').inputValue()) === '' && (await rows.count()) > 1, 'Clearing the filters did not restore the full list');
 record('SPM-52 live TC-16 search, filters and clear');

 // TC-06: edit, refresh, version 2 with before and after values.
 await page.locator('#equipment-search').fill(runId);
 await until(async () => (await rows.count()) === 1, 'Search did not find the item again');
 await page.getByRole('link', { name: 'Manage ' + name }).click();
 await page.getByRole('heading', { level: 1, name }).waitFor();
 const itemUrl = page.url();
 await page.locator('#edit-equipment-storageLocation').fill('Store Room C');
 await page.locator('#edit-equipment-totalQuantity').fill('6');
 await page.getByRole('button', { name: 'Save record' }).click();
 await page.getByText('Equipment updated.', { exact: true }).waitFor();
 await page.reload();
 await page.getByRole('heading', { level: 1, name }).waitFor();
 assert(await page.locator('#edit-equipment-storageLocation').inputValue() === 'Store Room C' && await page.locator('#edit-equipment-totalQuantity').inputValue() === '6', 'Edit did not survive a refresh');
 const edited = check(await supabase.from('equipment').select('version,storage_location,total_quantity').eq('equipment_id', equipmentId).single());
 assert(edited.version === 2 && edited.storage_location === 'Store Room C' && edited.total_quantity === 6, 'Edit not stored as version 2');
 const updateLog = check(await supabase.from('activity_log').select('changes').eq('entity_name', 'equipment').eq('entity_id', equipmentId).eq('action', 'EQUIPMENT_UPDATED').single());
 assert(updateLog.changes?.storageLocation?.before === 'Store Room B' && updateLog.changes?.storageLocation?.after === 'Store Room C', 'Update activity lacks before and after values');
 record('SPM-52 live TC-06 edit kept after refresh as version 2', { equipmentId });

 // TC-07: two tabs; the second save gets 409 with the current values.
 const tabB = await context.newPage();
 try {
  await tabB.goto(itemUrl);
  await tabB.getByRole('heading', { level: 1, name }).waitFor();
  await page.locator('#edit-equipment-storageLocation').fill('Store Room D');
  await page.getByRole('button', { name: 'Save record' }).click();
  await page.getByText('Equipment updated.', { exact: true }).waitFor();
  await tabB.locator('#edit-equipment-storageLocation').fill('Store Room E');
  const stale = tabB.waitForResponse((r) => r.url() === api + '/api/equipment/' + equipmentId && r.request().method() === 'PUT');
  await tabB.getByRole('button', { name: 'Save record' }).click();
  assert((await stale).status() === 409, 'Second tab was not refused');
  await tabB.getByText('This equipment was changed after you loaded it', { exact: true }).waitFor();
  await tabB.getByText('Store Room D', { exact: false }).first().waitFor();
 } finally { await tabB.close(); }
 const kept = check(await supabase.from('equipment').select('storage_location,version').eq('equipment_id', equipmentId).single());
 assert(kept.storage_location === 'Store Room D' && kept.version === 3, 'First tab change was not kept');
 record('SPM-52 live TC-07 two-tab conflict keeps the first save', { equipmentId });

 // AC7, AC8, TC-08, TC-10: unavailable stock, refusals named in Singapore time.
 await page.reload();
 await page.getByRole('heading', { level: 1, name }).waitFor();
 const day = sgDay.format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
 const period = sgDate.format(new Date(day + 'T17:00:00+08:00')) + ' · 17:00–18:00 SGT';
 const fillPeriod = async (quantity) => {
  await page.locator('#record-unavailable-quantity').fill(String(quantity));
  await page.locator('#record-unavailable-startsAt').fill(day + 'T17:00');
  await page.locator('#record-unavailable-endsAt').fill(day + 'T18:00');
  await page.locator('#record-unavailable-reason').selectOption('DAMAGED');
  await page.locator('#record-unavailable-note').fill('Live check record');
 };
 await page.getByRole('button', { name: 'Record unavailable stock' }).click();
 await fillPeriod(3);
 await page.getByRole('button', { name: 'Save', exact: true }).click();
 await page.getByText('Unavailable stock recorded.', { exact: true }).waitFor();
 const recordRow = check(await supabase.from('equipment_unavailability').select('unavailability_id,quantity,starts_at,ends_at,status').eq('equipment_id', equipmentId).single());
 assert(recordRow.quantity === 3 && Date.parse(recordRow.starts_at) === Date.parse(day + 'T17:00:00+08:00') && Date.parse(recordRow.ends_at) === Date.parse(day + 'T18:00:00+08:00'), 'Unavailable stock not stored in Singapore time');

 await page.locator('#edit-equipment-totalQuantity').fill('2');
 await page.getByRole('button', { name: 'Save record' }).click();
 const committed = page.locator('#edit-equipment-totalQuantity-error');
 await committed.waitFor();
 const committedText = await committed.innerText();
 assert(committedText === '3 units are unavailable during ' + period + ', so the total cannot be lower than 3.', 'Unexpected committed message: ' + committedText);
 await page.getByRole('button', { name: 'Reset' }).first().click();

 await page.getByRole('button', { name: 'Record unavailable stock' }).click();
 await fillPeriod(6);
 await page.getByRole('button', { name: 'Save', exact: true }).click();
 const exceeded = page.locator('#record-unavailable-quantity-error');
 await exceeded.waitFor();
 const exceededText = await exceeded.innerText();
 assert(exceededText === 'Only 3 units are left to mark unavailable during ' + period + '. Unavailable stock cannot exceed the total.', 'Unexpected stock message: ' + exceededText);
 await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
 const stillOne = check(await supabase.from('equipment_unavailability').select('unavailability_id').eq('equipment_id', equipmentId));
 const totalNow = check(await supabase.from('equipment').select('total_quantity').eq('equipment_id', equipmentId).single());
 assert(stillOne.length === 1 && totalNow.total_quantity === 6, 'A refused change was stored');

 await page.getByRole('button', { name: /^Cancel unavailable stock from/ }).click();
 await page.getByRole('button', { name: 'Confirm', exact: true }).click();
 await page.getByText('Unavailable stock cancelled.', { exact: true }).waitFor();
 const ended = check(await supabase.from('equipment_unavailability').select('status').eq('unavailability_id', recordRow.unavailability_id).single());
 assert(ended.status === 'CANCELLED', 'Record was not cancelled');
 record('SPM-52 live TC-08 TC-10 unavailable stock and Singapore-time refusals', { equipmentId, period });

 // AC9: deactivate and reactivate.
 await page.getByRole('button', { name: 'Deactivate equipment' }).click();
 await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
 await page.getByText('Equipment deactivated.', { exact: false }).waitFor();
 await page.getByRole('button', { name: 'Reactivate equipment' }).click();
 await page.getByText('Equipment reactivated.', { exact: false }).waitFor();
 const { body: finalItem } = await equipmentApi(token, '/' + equipmentId);
 assert(finalItem.equipment?.status === 'ACTIVE' && finalItem.equipment?.isActive === true, 'Item not active after reactivation');
 const actions = await equipmentActions(equipmentId);
 for (const action of ['EQUIPMENT_UNAVAILABILITY_RECORDED', 'EQUIPMENT_UNAVAILABILITY_ENDED', 'EQUIPMENT_DEACTIVATED', 'EQUIPMENT_REACTIVATED']) assert(actions.includes(action), 'Missing activity ' + action);
 record('SPM-52 live AC9 deactivate and reactivate with one activity entry each', { equipmentId, activityEntries: actions.length });
}

// SPM-52 AC1 and TC-05 for a role other than Technical Support.
async function verifyEquipmentDenied(page, role, equipmentCalls, token) {
 const res = await fetch(api + '/api/equipment', { headers: { Authorization: 'Bearer ' + token } });
 assert(res.status === 403, role + ' equipment API returned ' + res.status);
 await page.goto(base + '/dashboard');
 await page.getByRole('button', { name: 'Logout', exact: true }).waitFor();
 assert(await page.getByRole('link', { name: 'Equipment', exact: true }).count() === 0, role + ' sees an Equipment tab');
 for (const pathname of ['/equipment', '/equipment/1']) {
  await page.goto(base + pathname);
  await page.getByText('Access denied', { exact: true }).waitFor();
  assert(await page.locator('#equipment-search').count() === 0, role + ' sees the equipment catalogue at ' + pathname);
 }
 assert(equipmentCalls.length === 0, role + ' UI called the equipment API');
 await page.goto(base + '/dashboard');
 await page.getByRole('button', { name: 'Logout', exact: true }).waitFor();
 record('SPM-52 live TC-05 wrong role denied equipment', { role, api: res.status });
}

async function cleanupEquipment() {
 if (!equipmentIds.size) return;
 const idList = [...equipmentIds];
 const techSupportIds = users.filter((user) => user.role === 'TECH_SUPPORT').map((user) => user.user_id);
 const rows = check(await supabase.from('equipment').select('equipment_id,name,created_by').in('equipment_id', idList));
 assert(rows.every((row) => row.name.startsWith(runId) && techSupportIds.includes(row.created_by)), 'Refusing to clean non-fixture equipment');
 const { getMongoDb } = require(path.join(backendRoot, 'config/mongodb'));
 const details = (await getMongoDb()).collection('equipment_details');
 await details.deleteMany({ _id: { $in: idList.map(String) } });
 const { Client } = require(path.join(backendRoot, 'node_modules/pg'));
 const client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
 try {
  await client.query('BEGIN');
  await client.query('DELETE FROM public.equipment_unavailability WHERE equipment_id = ANY($1::integer[])', [idList]);
  await client.query("DELETE FROM public.outbox_entries WHERE target_collection = 'equipment_details' AND document_id = ANY($1::text[])", [idList.map(String)]);
  await client.query('DELETE FROM public.equipment WHERE equipment_id = ANY($1::integer[]) AND name LIKE $2', [idList, runId + ' %']);
  await client.query('COMMIT');
 } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
 const left = check(await supabase.from('equipment').select('equipment_id').in('equipment_id', idList));
 const leftDocuments = await details.countDocuments({ _id: { $in: idList.map(String) } });
 await require(path.join(backendRoot, 'config/mongodb')).closeMongoDb();
 assert(left.length === 0 && leftDocuments === 0, 'Live equipment cleanup incomplete');
 record('live equipment cleanup', { removedEquipment: idList.length });
}

async function main() {
 users=check(await supabase.from('user').select('user_id,name,role,email,auth_user_id,is_active').like('email','dev-%@connectsphere.test')).filter(user=>user.name.startsWith('Seed ')&&user.is_active&&user.auth_user_id);
 assert(process.env.SEED_ACCOUNT_PASSWORD,'SEED_ACCOUNT_PASSWORD is missing');
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [role,heading] of [['ORGANISER','Organisation Events'],['COORDINATOR','Event Coordinator dashboard'],['VENUE_STAFF','My Requests'],['TECH_SUPPORT','Technical Support dashboard'],['SAFETY_OFFICER','Safety Officer dashboard'],['ATTENDEE','Event Discovery']]) {
  if(process.env.LIVE_ROLES&&!process.env.LIVE_ROLES.split(',').includes(role))continue;
  const user=users.find(user=>user.role===role);assert(user,'Missing synthetic seed for '+role);
  const context=await browser.newContext({timezoneId:'Asia/Singapore'});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const tracked=[];
  const apiReads=[];
  const equipmentCalls=[];
  page.on('request',request=>{if(request.url().startsWith(api+'/api/equipment'))equipmentCalls.push(request.url());});
  page.on('request',request=>{if(request.url().startsWith(api+'/api/events')&&request.method()==='GET'){const u=new URL(request.url());apiReads.push(u.pathname+u.search);}});
  page.on('response',response=>{
   if(response.url().startsWith(api+'/api/events')&&['POST','PUT'].includes(response.request().method())) {
    tracked.push((async()=>{const body=await response.json().catch(()=>({}));if(body.event?.eventId && body.event.title?.startsWith(runId)){ids.add(body.event.eventId);fs.writeFileSync(output,JSON.stringify({runId,createdEventIds:[...ids],checks},null,2));}})());
   }
  });
  try {
   await login(page,user);await page.getByRole('heading',{name:heading,exact:true}).waitFor();record('real role login',{role,destination:new URL(page.url()).pathname});
   if(role==='COORDINATOR')await coordinatorLifecycle(page,user);
   if(role==='ORGANISER') {
    await page.getByRole('link',{name:'New Event',exact:false}).click();await complete(page,runId+' submitted request');
    assert(ids.size===0,'Next submitted before explicit Submit');
    const createRequest=page.waitForRequest(request=>request.url()===api+'/api/events'&&request.method()==='POST');
    await page.getByRole('button',{name:'Submit Request',exact:true}).click();const submittedPayload=(await createRequest).postDataJSON();await page.getByText(/^Your event request has been submitted successfully\. REQ-\d+ · Submitted\./).waitFor();await Promise.all(tracked);
    const submittedId=[...ids][0];assert(submittedId,'Missing submitted event');
    const row=check(await supabase.from('event').select('status,registration_capacity,coordinator_id,title,purpose,description,start_datetime,end_datetime,expected_attendance,preferred_layout_type,accessibility_needs').eq('event_id',submittedId).single());
    assert(row.status==='SUBMITTED'&&row.registration_capacity===30&&row.coordinator_id===null,'Incorrect submission state');
    assert(row.title===submittedPayload.title&&row.purpose===submittedPayload.purpose&&row.description===submittedPayload.description&&row.expected_attendance===25&&row.preferred_layout_type===submittedPayload.preferredLayoutType,'Event input fields did not persist');
    assert(Date.parse(row.start_datetime)===Date.parse(submittedPayload.startDatetime)&&Date.parse(row.end_datetime)===Date.parse(submittedPayload.endDatetime),'Proposed times did not persist');
    assert(String(row.accessibility_needs).includes('Wheelchair access requested.'),'Accessibility requirements did not persist');
    const preferences=check(await supabase.from('event_venue_preference').select('venue_id,preference_order').eq('event_id',submittedId).order('preference_order'));
    assert(JSON.stringify(preferences.map(row=>row.venue_id))===JSON.stringify(submittedPayload.venuePreferences),'Venue preferences did not persist');
    record('SPM-35 all input fields and venue preferences persisted',{venuePreferences:preferences.length});

    const notifications=check(await supabase.from('notification').select('title').eq('event_id',submittedId));assert(notifications.some(n=>n.title==='Event request received'),'Missing receipt notification');
    record('SPM-35 explicit submission and receipt',{eventId:submittedId,status:row.status,receipt:true});
    await page.getByRole('link',{name:'New Event',exact:false}).click();await page.locator('#title').fill(runId+' resumable draft');await page.locator('#purpose').fill('Will clear this later');
    const draftResponse=page.waitForResponse(r=>r.url()===api+'/api/events/drafts'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save as Draft',exact:false}).click();const draft=await(await draftResponse).json();await Promise.all(tracked);const draftId=draft.event.eventId;
    await page.getByText('Draft saved successfully.',{exact:true}).waitFor();await page.locator('article').filter({hasText:runId+' resumable draft'}).getByRole('link',{name:'Edit Draft',exact:false}).click();
    await page.locator('#purpose').waitFor();assert(await page.locator('#purpose').inputValue()==='Will clear this later','Draft was not prefilled');
    await page.locator('#purpose').fill('');await page.getByRole('button',{name:'Save as Draft',exact:false}).click();await page.getByText('Draft saved successfully.',{exact:true}).waitFor();
    const cleared=check(await supabase.from('event').select('purpose,status').eq('event_id',draftId).single());assert(cleared.purpose===null&&cleared.status==='DRAFT','Cleared draft field did not persist');
    await page.goto(base+'/events/new?draft='+draftId);await complete(page,runId+' resumable draft');
    const finalResponse=page.waitForResponse(r=>r.url()===api+`/api/events/${draftId}/submit`&&r.request().method()==='PUT');await page.getByRole('button',{name:'Submit Request',exact:true}).click();assert((await finalResponse).status()===200,'Saved draft submit failed');await page.getByText(/^Your event request has been submitted successfully\. REQ-\d+ · Submitted\./).waitFor();
    record('SPM-37 save, exact resume, clear and submit',{eventId:draftId});
    await page.getByRole('link',{name:'New Event',exact:false}).click();await page.locator('#title').waitFor();await page.clock.install();await page.locator('#title').fill(runId+' idle autosave');
    const autoCreate=page.waitForResponse(r=>r.url()===api+'/api/events/drafts'&&r.request().method()==='POST');await page.clock.fastForward(30000);const autoDraft=await(await autoCreate).json();await Promise.all(tracked);const autoId=autoDraft.event.eventId;
    await page.getByText(/Last auto-saved at/).waitFor();
    const activityBefore=await supabase.from('activity_log').select('log_id',{count:'exact',head:true}).eq('entity_name','event').eq('entity_id',autoId);if(activityBefore.error)throw activityBefore.error;
    await page.locator('#purpose').fill('Live idle autosave update');const autoUpdate=page.waitForResponse(r=>r.url()===api+`/api/events/${autoId}/draft`&&r.request().method()==='PUT');await page.clock.fastForward(30000);const updateResponse=await autoUpdate;assert(updateResponse.status()===200,'Live autosave update failed');await updateResponse.finished();
    const activityAfter=await supabase.from('activity_log').select('log_id',{count:'exact',head:true}).eq('entity_name','event').eq('entity_id',autoId);if(activityAfter.error)throw activityAfter.error;
    assert(activityBefore.count===activityAfter.count,'Autosave added an activity-log row');
    const autoStored=check(await supabase.from('event').select('purpose,status').eq('event_id',autoId).single());assert(autoStored.purpose==='Live idle autosave update'&&autoStored.status==='DRAFT','Autosave did not persist draft fields');
    record('SPM-37 real autosave POST then PUT without audit noise',{eventId:autoId});

   }
   if(role==='TECH_SUPPORT')await verifyEquipmentCatalogue(page,context,user);
   if(role==='ATTENDEE')await verifyAttendeeDiscovery(page,apiReads);
   // A revoked access token must also be rejected by the server.
   const token=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>/^sb-.*-auth-token$/.test(key));return key?JSON.parse(localStorage.getItem(key)).access_token:null;});
   if(role!=='ATTENDEE')await verifyDiscoveryDenied(page,role,apiReads,token);
   if(role!=='TECH_SUPPORT')await verifyEquipmentDenied(page,role,equipmentCalls,token);
   await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL(url=>url.pathname==='/login');
   const revoked=await fetch(api+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});assert(revoked.status===401,'Logout did not revoke token');
   assert(errors.length===0,'Browser runtime error: '+errors.join('; '));record('real logout and token revocation',{role});
  } finally {await Promise.allSettled(tracked);await context.close();}
 }
 const attendee=users.find(user=>user.role==='ATTENDEE');
 if(attendee)await verifySignedOutRedirectBack(attendee);
}
(async()=>{try{await main();}catch(e){record('failure',{message:e.message});process.exitCode=1;}finally{try{await cleanup();}catch(e){record('cleanup failure',{message:e.message});process.exitCode=1;}if(browser)await browser.close();fs.writeFileSync(output,JSON.stringify({runId,createdEventIds:[...ids],checks},null,2));}})();
