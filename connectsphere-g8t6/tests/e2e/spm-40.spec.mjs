import { test, expect } from '@playwright/test';
import { attachScreenshot, installConnectSphereMocks } from './support.mjs';

const original = {
  eventId:42,requestId:'REQ-000042',status:'UNDER_REVIEW',statusLabel:'Under Review',title:'SPM-40 review request',
  purpose:'Synthetic purpose',description:'Synthetic description',startDatetime:'2030-03-10T02:00:00Z',endDatetime:'2030-03-10T04:00:00Z',
  expectedAttendance:100,preferredLayoutType:'THEATRE',accessibilityNeeds:[],venuePreferences:[],equipmentRequirements:[],
  isRegistrationEnabled:false,registrationCapacity:null,version:3,arrangementVersion:1,
  createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',organisation:{organisationId:1,name:'Synthetic Org'},
  isAssignedToCoordinator:true,isOwner:false,viewerRelationship:'ASSIGNED_COORDINATOR',coordinatorId:11,
  organiser:{userId:5,name:'Synthetic Owner'},
  permissions:{canEdit:true,editableFields:['title','purpose','description'],canViewDraftHistory:false,canViewStaffHistory:true},
};
async function setup(page, {role='COORDINATOR',event=original,refusal=null,lost=false,history=[]}={}) {
  await installConnectSphereMocks(page,{role});
  const commands=[];
  await page.route(/\/api\/events\/42(?:\/[^?]*)?(?:\?.*)?$/,async route=>{
    const req=route.request();const path=new URL(req.url()).pathname;
    if(req.method()==='OPTIONS')return route.fallback();
    if(path.endsWith('/reject')){
      commands.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});
      if(refusal)return route.fulfill({status:refusal.status,json:refusal.body});
      if(lost && commands.length===1)return route.fulfill({status:500,json:{error:'Response lost.',code:'INTERNAL_ERROR'}});
      return route.fulfill({json:{message:'Event request rejected. The organiser has been notified.',event:{...event,status:'REJECTED',statusLabel:'Rejected',version:4}}});
    }
    if(path.endsWith('/history'))return route.fulfill({json:{history:typeof history==='function'?history(commands):history,nextCursor:null,lastViewedAt:null}});
    if(path.endsWith('/history/viewed'))return route.fulfill({json:{lastViewedAt:null}});
    if(path.endsWith('/clarifications'))return route.fulfill({json:{clarifications:[]}});
    if(path.endsWith('/venue-bookings'))return route.fulfill({json:{eventId:42,requestId:'REQ-000042',eventType:null,eventTypeLabel:null,canRequestVenueBookings:false,bookings:[]}});
    if(path.endsWith('/safety-reviews'))return route.fulfill({json:{reviews:[]}});
    if(path.endsWith('/venue-options'))return route.fulfill({json:{event:{eventId:42},venues:[],preferredVenues:[],detailsAvailable:true,availabilityChecked:true,filtersNotChecked:[],canSuggestVenue:false}});
    if(path==='/api/events/42')return route.fulfill({json:{event}});
    return route.fallback();
  });
  await page.goto('/events/42');
  return commands;
}
async function open(page){await page.getByRole('button',{name:'Reject request',exact:true}).click();return page.getByRole('dialog',{name:'Reject event request?'});}

for(const mobile of [false,true])test(`[SPM-40 TC1] rejection success ${mobile?'mobile':'desktop'}`,async({page},info)=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const commands=await setup(page);const dialog=await open(page);
  await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Venue capacity insufficient for 500 attendees. Please revise scope.');
  await page.screenshot({path:`/tmp/spm40-${mobile?"mobile":"desktop"}.png`});
  await attachScreenshot(info,page,`spm40-confirm-${mobile?'mobile':'desktop'}`);
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByRole('status').filter({hasText:'Status updated'})).toContainText('Event request rejected. The organiser has been notified.');
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toHaveCount(0);
  expect(commands).toHaveLength(1);expect(commands[0].body.version).toBe(3);expect(commands[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile?390:1280);
});
test('[SPM-40 TC2/3] blank and nine characters fail, ten succeeds',async({page})=>{
  const commands=await setup(page);const dialog=await open(page);
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Rejection notes are required',{exact:true})).toBeVisible();
  await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('123456789');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Rejection notes must contain at least 10 characters.',{exact:true})).toBeVisible();
  expect(commands).toHaveLength(0);
  await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('1234567890');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Status updated',{exact:true})).toBeVisible();expect(commands).toHaveLength(1);
});
test('[SPM-40 TC4] cancelling sends no command',async({page})=>{
  const commands=await setup(page);const dialog=await open(page);
  await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Valid reason text');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(dialog).not.toBeVisible();expect(commands).toHaveLength(0);
  await expect(page.getByText('Status updated',{exact:true})).toHaveCount(0);
});
test('[SPM-40] unsaved invalid details block rejection until cancelled',async({page})=>{
  const commands=await setup(page);
  await page.getByRole('button',{name:'Edit details',exact:true}).click();
  await page.getByRole('textbox',{name:'Title',exact:false}).fill('');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toBeEnabled();expect(commands).toHaveLength(0);
});
test('[SPM-40] uncertain response survives reload and retries identical command',async({page})=>{
  const commands=await setup(page,{lost:true});let dialog=await open(page);
  await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Valid reason text');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Response lost.',{exact:true})).toBeVisible();
  await page.reload();dialog=await open(page);
  await expect(dialog.getByRole('textbox',{name:'Rejection notes'})).toHaveValue('Valid reason text');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Status updated',{exact:true})).toBeVisible();
  expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);
});
for(const status of ['REJECTED','CANCELLED','CONFIRMED','PLANNING'])test(`[SPM-40] no rejection control in ${status}`,async({page})=>{
  await setup(page,{event:{...original,status}});
  await expect(page.getByRole('heading',{name:original.title,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toHaveCount(0);
});
test('[SPM-40] organiser cannot see coordinator rejection controls',async({page})=>{
  await setup(page,{role:'ORGANISER',event:{...original,status:undefined,viewerRelationship:'OWNER',isOwner:true,isAssignedToCoordinator:false,permissions:{canEdit:false,editableFields:[],canViewDraftHistory:true,canViewStaffHistory:false}}});
  await expect(page.getByRole('heading',{name:original.title,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toHaveCount(0);
});
test('[SPM-40] version conflict updates state and does not show success',async({page})=>{
  await setup(page,{refusal:{status:409,body:{code:'EVENT_VERSION_CONFLICT',error:'Event changed. Review the latest details.',event:{...original,status:'CANCELLED',version:4}}}});
  const dialog=await open(page);await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Valid reason text');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Event changed. Review the latest details.',{exact:true})).toBeVisible();
  await expect(page.getByText('Status updated',{exact:true})).toHaveCount(0);
});

test('[SPM-40] expiry preserves notes and command for reauthentication',async({page})=>{
  const commands=await setup(page,{refusal:{status:401,body:{code:'UNAUTHENTICATED',error:'Sign in again.'}}});
  const dialog=await open(page);await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Valid reason text');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page).toHaveURL(/\/login\?/);
  const record=await page.evaluate(()=>{
    const key=Object.keys(sessionStorage).find(key=>key.startsWith('connectsphere:recovery:spm40:'));
    return key?JSON.parse(sessionStorage.getItem(key)):null;
  });
  expect(record).toMatchObject({reason:'Valid reason text',version:3,key:commands[0].key});
});

test('[SPM-40] pending rejection sends one command and prevents cancelling in flight',async({page})=>{
  await setup(page);let release;const gate=new Promise(resolve=>{release=resolve;});let count=0;
  await page.route('**/api/events/42/reject',async route=>{
    count++;await gate;return route.fulfill({json:{message:'Event request rejected.',event:{...original,status:'REJECTED',version:4}}});
  });
  const dialog=await open(page);await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Valid reason text');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(dialog.getByRole('button',{name:'Rejecting…'})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  expect(count).toBe(1);release();
  await expect(page.getByText('Status updated',{exact:true})).toBeVisible();expect(count).toBe(1);
});


const rejectionEntry = {
  historyId:1001,action:'EVENT_REJECTED',actor:{userId:11,name:'Synthetic Coordinator',role:'COORDINATOR'},
  occurredAt:'2026-10-30T02:30:00Z',summary:'Venue capacity is insufficient for this request.',audience:'ORGANISER_SAFE',
  changes:[{field:'status',before:'UNDER_REVIEW',after:'REJECTED',beforeLabel:'Under Review',afterLabel:'Rejected'}],
};
test('[SPM-40] coordinator history refreshes with rejection action, reason and actor',async({page})=>{
  await setup(page,{history:commands=>commands.length?[rejectionEntry]:[]});
  const dialog=await open(page);await dialog.getByRole('textbox',{name:'Rejection notes'}).fill(rejectionEntry.summary);
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  const history=page.getByRole('region',{name:'Change history'});
  await expect(history.getByText('Request rejected',{exact:true})).toBeVisible();
  await expect(history.getByText(rejectionEntry.summary,{exact:true})).toBeVisible();
  await expect(history.getByText(/Synthetic Coordinator/)).toBeVisible();
});
test('[SPM-40] rejected organiser view shows reason and history after refresh',async({page})=>{
  const event={...original,status:undefined,statusLabel:'Rejected',rejectionReason:rejectionEntry.summary,
    viewerRelationship:'OWNER',isOwner:true,isAssignedToCoordinator:false,
    permissions:{canEdit:false,editableFields:[],canViewDraftHistory:true,canViewStaffHistory:false}};
  await setup(page,{role:'ORGANISER',event,history:[rejectionEntry]});
  const banner=page.getByRole('status').filter({has:page.getByText('Rejection reason',{exact:true})});
  await expect(banner).toContainText(rejectionEntry.summary);
  await expect(page.getByRole('region',{name:'Change history'}).getByText('Request rejected',{exact:true})).toBeVisible();
  await page.reload();await expect(banner).toContainText(rejectionEntry.summary);
});
test('[SPM-40] returning to an existing organiser tab refreshes rejection and history',async({page})=>{
  const event={...original,status:undefined,statusLabel:'Under Review',viewerRelationship:'OWNER',isOwner:true,isAssignedToCoordinator:false,
    permissions:{canEdit:false,editableFields:[],canViewDraftHistory:true,canViewStaffHistory:false}};
  await setup(page,{role:'ORGANISER',event});
  await expect(page.getByRole('heading',{name:original.title,exact:true})).toBeVisible();
  await page.route('**/api/events/42',route=>route.fulfill({json:{event:{...event,statusLabel:'Rejected',rejectionReason:rejectionEntry.summary,version:4}}}));
  await page.route('**/api/events/42/history?*',route=>route.fulfill({json:{history:[rejectionEntry],nextCursor:null,lastViewedAt:null}}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status').filter({has:page.getByText('Rejection reason',{exact:true})})).toContainText(rejectionEntry.summary);
  await expect(page.getByRole('region',{name:'Change history'}).getByText('Request rejected',{exact:true})).toBeVisible();
});

test('[SPM-40] an older background refresh cannot undo confirmed rejection',async({page})=>{
  await setup(page);
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toBeVisible();
  let release;const gate=new Promise(resolve=>{release=resolve;});let requested;
  const started=new Promise(resolve=>{requested=resolve;});
  await page.route('**/api/events/42',async route=>{
    requested();await gate;return route.fulfill({json:{event:original}});
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await started;
  const dialog=await open(page);await dialog.getByRole('textbox',{name:'Rejection notes'}).fill('Valid reason text');
  await dialog.getByRole('button',{name:'Confirm rejection'}).click();
  await expect(page.getByText('Status updated',{exact:true})).toBeVisible();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/events/42');
  release();await (await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByRole('button',{name:'Reject request',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Approve request',exact:true})).toBeDisabled();
});


test('[SPM-40] rejection notes render as text, including markup and long unbroken words',async({page})=>{
  const notes='<img src=x onerror="window.spm40Injected=true">'+'a'.repeat(1500);
  await page.setViewportSize({width:390,height:844});
  await setup(page,{role:'ORGANISER',event:{...original,status:undefined,statusLabel:'Rejected',rejectionReason:notes,
    viewerRelationship:'OWNER',isOwner:true,isAssignedToCoordinator:false,
    permissions:{canEdit:false,editableFields:[],canViewDraftHistory:true,canViewStaffHistory:false}},
    history:[{...rejectionEntry,summary:notes}]});
  const history=page.getByRole('region',{name:'Change history'});
  await expect(history.getByText(notes,{exact:true})).toBeVisible();
  await expect(history.locator('img')).toHaveCount(0);
  expect(await page.evaluate(()=>window.spm40Injected)).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});


for (const failure of ['server', 'network']) test(`[SPM-40] ${failure} background refresh preserves rejection notes and retries`, async ({ page }) => {
  const commands = await setup(page);
  const dialog = await open(page);
  const notes = 'Keep these unsent rejection notes.';
  await dialog.getByRole('textbox', { name: 'Rejection notes' }).fill(notes);
  await page.route('**/api/events/42', route => failure === 'network'
    ? route.abort('failed')
    : route.fulfill({ status: 503, json: { error: 'Temporary refresh failure' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Event refresh unavailable', { exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('textbox', { name: 'Rejection notes' })).toHaveValue(notes);
  // The notice is outside the modal; close and reopen to check both recovery paths.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Event refresh unavailable', { exact: true })).toBeVisible();
  await open(page);
  await dialog.getByRole('textbox', { name: 'Rejection notes' }).fill(notes);
  await page.route('**/api/events/42', route => route.fulfill({ json: { event: original } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Event refresh unavailable', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Rejection notes' })).toHaveValue(notes);
  await dialog.getByRole('button', { name: 'Confirm rejection' }).click();
  await expect(page.getByText('Status updated', { exact: true })).toBeVisible();
  expect(commands).toHaveLength(1);
  expect(commands[0].body.reason).toBe(notes);
});

for (const status of [403, 404]) test(`[SPM-40] background ${status} removes event access and rejection controls`, async ({ page }) => {
  const commands = await setup(page);
  await open(page);
  await page.route('**/api/events/42', route => route.fulfill({ status, json: { error: 'Event unavailable' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog', { name: 'Reject event request?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject request', exact: true })).toHaveCount(0);
  await expect(page.getByText('Event refresh unavailable', { exact: true })).toHaveCount(0);
  expect(commands).toHaveLength(0);
});
