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
 // Hidden events: one unpublished and one published but not CONFIRMED, chosen from the data.
 const hidden=[
  check(await supabase.from('event').select('event_id').eq('is_published',false).neq('status','DRAFT').limit(1)),
  check(await supabase.from('event').select('event_id').eq('is_published',true).neq('status','CONFIRMED').limit(1)),
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
// SPM-173 readiness and submission/refusal through the real coordinator UI and
// backend. Venue decisions are seeded directly because SPM-186 has no UI yet.
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

 // SPM-249 owns safety decisions. Without a seeded Safety Officer and its
 // authorized decision endpoint, this live script verifies the refusal only.
}
async function main() {
 users=check(await supabase.from('user').select('user_id,name,role,email,auth_user_id,is_active').like('email','dev-%@connectsphere.test')).filter(user=>user.name.startsWith('Seed ')&&user.is_active&&user.auth_user_id);
 assert(process.env.SEED_ACCOUNT_PASSWORD,'SEED_ACCOUNT_PASSWORD is missing');
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [role,heading] of [['ORGANISER','My Requests'],['COORDINATOR','Event Coordinator dashboard'],['VENUE_STAFF','My Requests'],['TECH_SUPPORT','Technical Support dashboard'],['ATTENDEE','Event Discovery']]) {
  if(process.env.LIVE_ROLES&&!process.env.LIVE_ROLES.split(',').includes(role))continue;
  const user=users.find(user=>user.role===role);assert(user,'Missing synthetic seed for '+role);
  const context=await browser.newContext({timezoneId:'Asia/Singapore'});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const tracked=[];
  const apiReads=[];
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
   if(role==='ATTENDEE')await verifyAttendeeDiscovery(page,apiReads);
   // A revoked access token must also be rejected by the server.
   const token=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>/^sb-.*-auth-token$/.test(key));return key?JSON.parse(localStorage.getItem(key)).access_token:null;});
   if(role!=='ATTENDEE')await verifyDiscoveryDenied(page,role,apiReads,token);
   await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL(url=>url.pathname==='/login');
   const revoked=await fetch(api+'/api/auth/me',{headers:{Authorization:'Bearer '+token}});assert(revoked.status===401,'Logout did not revoke token');
   assert(errors.length===0,'Browser runtime error: '+errors.join('; '));record('real logout and token revocation',{role});
  } finally {await Promise.allSettled(tracked);await context.close();}
 }
 const attendee=users.find(user=>user.role==='ATTENDEE');
 if(attendee)await verifySignedOutRedirectBack(attendee);
}
(async()=>{try{await main();}catch(e){record('failure',{message:e.message});process.exitCode=1;}finally{try{await cleanup();}catch(e){record('cleanup failure',{message:e.message});process.exitCode=1;}if(browser)await browser.close();fs.writeFileSync(output,JSON.stringify({runId,createdEventIds:[...ids],checks},null,2));}})();
