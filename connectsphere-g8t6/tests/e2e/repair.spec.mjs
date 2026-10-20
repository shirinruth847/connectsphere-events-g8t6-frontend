import { test, expect } from '@playwright/test';
import { installConnectSphereMocks, installLoginMock, makeDraft, enterCompleteRequestThroughSubmit } from './support.mjs';

test('[SPM-35 UI] organiser sidebar and filters retain the shree layout', async ({page}) => {
 await installConnectSphereMocks(page);
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/dashboard');
 await expect(page.getByRole('heading',{name:'My Requests',exact:true})).toBeVisible();
 const navigation=page.getByRole('navigation',{name:'Main Navigation',exact:true});
 const rows=await navigation.locator(':scope > a, :scope > span').evaluateAll(elements=>elements.map(element=>{
  const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom};
 }));
 const panel=await page.locator('aside').boundingBox();
 expect(rows).toHaveLength(5);
 for(let index=0;index<rows.length;index++) {
  expect(rows[index].x).toBeGreaterThanOrEqual(panel.x);
  expect(rows[index].right).toBeLessThanOrEqual(panel.x+panel.width);
  if(index) expect(rows[index].y).toBeGreaterThanOrEqual(rows[index-1].bottom);
 }
 const filter=page.locator('label').filter({has:page.getByRole('combobox')});
 const caption=await filter.locator('span').boundingBox();
 const selection=await filter.getByRole('combobox').boundingBox();
 expect(selection.x).toBeGreaterThanOrEqual(caption.x+caption.width);
 expect(Math.abs((caption.y+caption.height/2)-(selection.y+selection.height/2))).toBeLessThan(4);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await expect.poll(async()=>Math.round((await page.locator('aside').boundingBox()).x)).toBe(0);
 await expect(navigation.getByRole('link',{name:'My Drafts',exact:true})).toBeVisible();
 await navigation.getByRole('link',{name:'My Drafts',exact:true}).click();
 await expect(page).toHaveURL(/status=DRAFT/);
 await expect(navigation.getByRole('link',{name:'My Drafts',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const [role, heading] of [['ORGANISER','My Requests'],['COORDINATOR','Event Coordinator dashboard'],['VENUE_STAFF','Venue Staff dashboard'],['TECH_SUPPORT','Technical Support dashboard'],['ATTENDEE','My Registrations'],['COORDINATOR_LEAD','Assignment queue']]) {
 test(`[SPM-32] ${role} login reaches its authorised workspace`, async ({page}) => {
  await installLoginMock(page,{role});await page.goto('/login');await page.getByLabel('Email',{exact:false}).fill('user@example.com');await page.getByLabel('Password',{exact:false}).fill('Valid-password9');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
  if(role==='ATTENDEE') {await expect(page.getByText('Registered attendee event')).toBeVisible();await expect(page.getByText('Assigned coordinator event')).toHaveCount(0);}
  if(role==='COORDINATOR') await expect(page.getByText('Assigned coordinator event')).toBeVisible();
  const shell=page.locator('[data-dashboard-shell]');
  await expect(shell).toHaveAttribute('data-dashboard-shell',role);
  expect((await shell.locator('aside').boundingBox()).width).toBe(225);
  const nav=page.getByRole('navigation',{name:'Main Navigation',exact:true});
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  if(role!=='ORGANISER') {
   await expect(nav.getByRole('link',{name:'My Requests',exact:true})).toHaveCount(0);
   await expect(page.getByRole('link',{name:'Add Quick Event',exact:false})).toHaveCount(0);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect.poll(async()=>Math.round((await shell.locator('aside').boundingBox()).x)).toBe(0);
  await expect(nav.locator('[aria-current="page"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Open menu',exact:true})).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('button',{name:'Logout',exact:true}).click();
  await expect(page).toHaveURL(/\/login/);
 });
}
test('[SPM-174] Lead login opens the unassigned queue and can navigate to calendar and assignments', async ({page}) => {
 await installLoginMock(page,{role:'COORDINATOR_LEAD'});
 await page.goto('/login');
 await page.locator('#email').fill('user@example.com');
 await page.locator('#password').fill('Valid-password9');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Assignment queue',exact:true})).toBeVisible();
 await expect(page.getByText('Unassigned lead queue event',{exact:true})).toBeVisible();
 const expectedSubmittedAt = await page.evaluate(() => new Date('2026-10-20T08:30:00.000Z').toLocaleString());
 await expect(page.locator('.submitted')).toHaveText(`Submitted ${expectedSubmittedAt}`);
 await expect(page.getByText('Purpose: Community outreach',{exact:true})).toBeVisible();
 await expect(page.locator('.details-panel > div').nth(2).locator('strong')).toHaveText('Preference 1: Venue #1');
 await expect(page.getByText('Preference 1: Venue #1',{exact:true})).toBeVisible();
 await expect(page.getByText('Equipment #4: 2 units requested',{exact:true})).toBeVisible();
 const navigation=page.getByRole('navigation',{name:'Main Navigation',exact:true});
 await expect(navigation.getByRole('link',{name:'Unassigned Queue',exact:true})).toHaveAttribute('aria-current','page');
 await navigation.getByRole('link',{name:'Calendar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Coordinator calendar',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/20 Test Coordinator has an event/})).toBeVisible();
 await navigation.getByRole('link',{name:'Assignments',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Assignments',exact:true})).toBeVisible();
 await expect(page.getByText('Covered in later scope',{exact:true})).toBeVisible();
});

test('[SPM-174] the unassigned queue remains available when coordinator calendar data fails', async ({page}) => {
 const state=await installConnectSphereMocks(page);
 state.role='COORDINATOR_LEAD';
 state.failure={path:'/api/events/coordinator-availability',status:500,body:{error:'Calendar service unavailable.'}};
 await page.goto('/events');
 await expect(page.getByRole('heading',{name:'Assignment queue',exact:true})).toBeVisible();
 await expect(page.getByText('Unassigned lead queue event',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Calendar',exact:true}).click();
 await expect(page.locator('.calendar-panel').getByRole('alert')).toContainText('Availability unavailable');
 await expect(page.getByText('No coordinators with events to display.',{exact:true})).toBeVisible();
});

test('[SPM-174] queue 401 expires the session and returns the Lead to sign-in', async ({page}) => {
 const state=await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});
 state.failure={path:'/api/events/unassigned',status:401,body:{error:'Please log in to continue.'}};
 await page.goto('/events');
 await expect(page).toHaveURL(/\/login\?next=%2Fevents&reason=required/);
 const profileRequest=state.requestLog.findIndex(request=>request.pathname==='/api/auth/me');
 const queueRequest=state.requestLog.findIndex(request=>request.pathname==='/api/events/unassigned');
 expect(profileRequest).toBeGreaterThanOrEqual(0);
 expect(queueRequest).toBeGreaterThan(profileRequest);
});

test('[SPM-174] overnight coordinator events appear on each day they overlap, excluding midnight end', async ({page}) => {
 const state=await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});
 state.coordinators=[{coordinatorId:21,name:'Test Coordinator',events:[
  {eventId:801,title:'Overnight coordinator event',status:'CONFIRMED',startDatetime:'2026-10-20T15:00:00.000Z',endDatetime:'2026-10-20T17:00:00.000Z'},
  {eventId:802,title:'Event ending at midnight',status:'CONFIRMED',startDatetime:'2026-10-20T14:00:00.000Z',endDatetime:'2026-10-20T16:00:00.000Z'},
 ]}];
 await page.clock.install({time:new Date('2026-10-20T02:00:00.000Z')});
 await page.goto('/calendar');
 await page.getByRole('button',{name:'Day',exact:true}).click();
 const dayView=page.locator('.cal-day-view');
 await expect(dayView.getByText('Event ending at midnight')).toBeVisible();
 await expect(dayView.getByText('Overnight coordinator event')).toBeVisible();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(dayView.getByText('Overnight coordinator event')).toBeVisible();
 await expect(dayView.getByText('Event ending at midnight')).toHaveCount(0);
});

test('[SPM-174] coordinator All and None filters set explicit selections', async ({page}) => {
 const state=await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});
 state.coordinators=[
  {coordinatorId:21,name:'Coordinator A',events:[]},
  {coordinatorId:22,name:'Coordinator B',events:[]},
 ];
 await page.goto('/calendar');
 const filter=page.locator('.cal-legend');
 await filter.getByRole('button',{name:/All coordinators/}).click();
 const panel=page.getByRole('listbox');
 await panel.getByRole('checkbox',{name:'Coordinator A'}).uncheck();
 await panel.getByRole('button',{name:'All',exact:true}).click();
 await expect(filter.getByRole('button',{name:/All coordinators/})).toBeVisible();
 await filter.getByRole('button',{name:/All coordinators/}).click();
 await filter.getByRole('button',{name:'None',exact:true}).click();
 await expect(filter.getByRole('button',{name:/No coordinators/})).toBeVisible();
 await expect(filter.locator('.cal-legend-checkbox:checked')).toHaveCount(0);
 await expect(page.getByText('No coordinators selected. Click a name in the legend above to show their events.')).toBeVisible();
});
test('[SPM-32 TC-008–010] blank login fields show inline errors', async ({page}) => {
 await installLoginMock(page);await page.goto('/login');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText('Email is required.')).toBeVisible();await expect(page.getByText('Password is required.')).toBeVisible();
});
test('[SPM-32 TC-006/007] invalid credentials remain on login with a generic error', async ({page}) => {
 await installLoginMock(page,{invalid:true});await page.goto('/login');await page.locator('#email').fill('unknown@example.com');await page.locator('#password').fill('WrongPassword9');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText('Unable to sign in. Check your email and password.')).toBeVisible();await expect(page).toHaveURL(/\/login/);
});
test('[SPM-32 TC-011/012 / SPM-35 TC-004] protected create returns after login', async ({page}) => {
 await installLoginMock(page);await page.goto('/events/create');await expect(page).toHaveURL(/\/login\?next=/);await expect(page.getByText('Please log in first to continue.')).toBeVisible();await page.locator('#email').fill('user@example.com');await page.locator('#password').fill('Valid-password9');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Create Event Request',exact:true})).toBeVisible();await expect(page).toHaveURL(/\/events\/create/);
});
test('[SPM-32 TC-013] logout revokes backend session and Back cannot restore content', async ({page}) => {
 const state=await installConnectSphereMocks(page);await page.goto('/dashboard');await expect(page.getByRole('heading',{name:'My Requests',exact:true})).toBeVisible();await page.getByRole('link',{name:'New Event',exact:false}).click();await expect(page.locator('#title')).toBeVisible();await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(page).toHaveURL(/\/login/);expect(state.revoked).toBe(true);await page.goBack();await expect(page).toHaveURL(/\/login/);await expect(page.getByRole('heading',{name:'My Requests',exact:true})).toHaveCount(0);
});
test('[SPM-32 TC-012] malicious normalised next cannot redirect off-site', async ({page}) => {
 await installLoginMock(page);await page.goto('/login?next=%2F..%2F%2Fevil.example');await page.locator('#email').fill('user@example.com');await page.locator('#password').fill('Valid-password9');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/127\.0\.0\.1:3100\/dashboard/);
});
test('[SPM-35 AC1–4] Next never submits; registration is configured before explicit Submit', async ({page}) => {
 const state=await installConnectSphereMocks(page);await page.goto('/events/new');await enterCompleteRequestThroughSubmit(page);expect(state.createEventRequests).toHaveLength(0);await page.getByLabel('Enable event registration').check();await page.getByLabel('Registration capacity').fill('180');await page.getByRole('button',{name:'Submit Request',exact:true}).click();await expect(page.getByText('Your event request has been submitted successfully.')).toBeVisible();expect(state.createEventRequests).toHaveLength(1);expect(state.createEventRequests[0].payload.registrationCapacity).toBe(180);await expect(page.locator('article').getByText('Submitted',{exact:true}).first()).toBeVisible();
});
test('[SPM-35 AC2] Next blocks missing required fields', async ({page}) => {
 await installConnectSphereMocks(page);await page.goto('/events/new');await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('Event Title is required.')).toBeVisible();await expect(page.getByText('Event Purpose is required.')).toBeVisible();await expect(page.getByRole('heading',{name:'Event Identity & Core Purpose',exact:true})).toBeVisible();
});
test('[SPM-37 Scenario 1/4] title-only draft saves; clearing fields persists', async ({page}) => {
 const state=await installConnectSphereMocks(page,{draft:makeDraft()});await page.goto('/events/new?draft=43');await page.locator('#title').fill('Title-only draft');await page.locator('#purpose').fill('');await page.locator('#description').fill('');await page.getByRole('button',{name:'Save as Draft',exact:false}).click();await expect(page.getByText('Draft saved successfully.')).toBeVisible();expect(state.draftUpdateRequests.at(-1).purpose).toBe(null);await page.getByRole('link',{name:'Edit Draft',exact:false}).click();await expect(page.locator('#purpose')).toHaveValue('');await expect(page.locator('#description')).toHaveValue('');
});
test('[SPM-37 Scenario 3] input idle resets timer; first POST then autosave PUT', async ({page}) => {
 const state=await installConnectSphereMocks(page);await page.clock.install();await page.goto('/events/new');await page.locator('#title').fill('Autosaved draft');await page.clock.fastForward(29000);expect(state.draftCreateRequests).toHaveLength(0);await page.mouse.move(20,20);await page.clock.fastForward(29000);expect(state.draftCreateRequests).toHaveLength(0);await page.clock.fastForward(1000);await expect.poll(()=>state.draftCreateRequests.length).toBe(1);await expect(page.getByText(/Last auto-saved at/)).toBeVisible();await page.locator('#purpose').fill('Updated purpose');await page.clock.fastForward(30000);await expect.poll(()=>state.draftUpdateRequests.length).toBe(1);expect(state.draftUpdateRequests[0].isAutoSave).toBe(true);expect(state.draftCreateRequests).toHaveLength(1);
});
test('[SPM-37 Scenario 3] slow autosave and manual save never create a second draft', async ({page}) => {
 const state=await installConnectSphereMocks(page);
 state.delay=800;
 await page.clock.install();
 await page.goto('/events/new');
 await page.locator('#title').fill('One draft');
 await page.clock.fastForward(30000);
 await expect.poll(()=>state.draftCreateRequests.length).toBe(1);
 await page.getByRole('button',{name:'Save as Draft',exact:false}).click();
 await expect(page.getByText('Draft saved successfully.')).toBeVisible();
 expect(state.draftCreateRequests).toHaveLength(1);
 expect(state.draftUpdateRequests).toHaveLength(1);
});
test('[SPM-37 Scenario 5] dirty link and browser Back show the in-app warning', async ({page}) => {
 await installConnectSphereMocks(page);await page.goto('/dashboard');await page.getByRole('link',{name:'New Event',exact:false}).click();await page.locator('#title').fill('Unsaved title');await page.getByRole('link',{name:'Close request and return to dashboard'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Keep editing'}).click();await expect(page.locator('#title')).toHaveValue('Unsaved title');await page.goBack();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Keep editing'}).click();await expect(page.locator('#title')).toHaveValue('Unsaved title');await page.getByRole('link',{name:'Close request and return to dashboard'}).click();await page.getByRole('button',{name:'Leave page'}).click();await expect(page.getByRole('heading',{name:'My Requests',exact:true})).toBeVisible();await expect(page.getByText('Draft saved successfully.')).toHaveCount(0);
});
test('[SPM-37 Scenario 4] submitted or missing draft never renders an editable form', async ({page}) => {
 await installConnectSphereMocks(page,{draft:makeDraft({status:'SUBMITTED'})});await page.goto('/events/new?draft=43');await expect(page.getByText('Draft unavailable',{exact:true})).toBeVisible();await expect(page.locator('#title')).toHaveCount(0);await page.goto('/events/new?draft=999');await expect(page.getByText('Draft unavailable',{exact:true})).toBeVisible();await expect(page.locator('#title')).toHaveCount(0);
});
test('[SPM-35 AC2] server scheduling errors appear on the scheduling step', async ({page}) => {
 const state=await installConnectSphereMocks(page);state.failure={path:'/api/events',status:400,body:{error:'Please correct the highlighted fields.',fields:{startDatetime:'Server says the start is too soon.'}}};await page.goto('/events/new');await enterCompleteRequestThroughSubmit(page);await page.getByRole('button',{name:'Submit Request',exact:true}).click();await expect(page.getByText('Server says the start is too soon.')).toBeVisible();await expect(page.getByRole('heading',{name:'Scheduling & Attendance Estimates',exact:true})).toBeVisible();
});
test('[SPM-35 auth] a business-call 401 redirects to login', async ({page}) => {
 const state=await installConnectSphereMocks(page);state.failure={path:'/api/events/mine',status:401,body:{error:'Please log in to continue.'}};await page.goto('/dashboard');await expect(page).toHaveURL(/\/login/);await expect(page.getByRole('heading',{name:'My Requests',exact:true})).toHaveCount(0);
});

test('[SPM-37 Scenario 4] final draft submission is one atomic write', async ({page}) => {
 const state=await installConnectSphereMocks(page,{draft:makeDraft()});await page.goto('/events/new?draft=43');await enterCompleteRequestThroughSubmit(page);await page.getByRole('button',{name:'Submit Request',exact:true}).click();await expect(page.getByText('Your event request has been submitted successfully.')).toBeVisible();expect(state.submitDraftRequests).toHaveLength(1);expect(state.draftUpdateRequests).toHaveLength(0);
});
test('[SPM-37 409] stale draft locks the editor and stops autosave', async ({page}) => {
 const state=await installConnectSphereMocks(page,{draft:makeDraft()});state.failure={path:'/api/events/43/draft',status:409,body:{error:'This event is no longer a draft.',code:'NOT_DRAFT'}};await page.goto('/events/new?draft=43');await page.locator('#title').fill('Stale edit');await page.getByRole('button',{name:'Save as Draft',exact:false}).click();await expect(page.getByText('Draft unavailable',{exact:true})).toBeVisible();await expect(page.locator('#title')).toHaveCount(0);
});
test('[SPM-35 dashboard] unknown API status does not crash', async ({page}) => {
 await installConnectSphereMocks(page,{draft:makeDraft({status:'APPROVED',statusLabel:'Legacy approval'})});await page.goto('/dashboard');await expect(page.locator('article').getByText('Legacy approval')).toBeVisible();
});
test('[SPM-32/37] expired session preserves unsaved form across reauthentication', async ({page}) => {
 const state=await installLoginMock(page,{authenticated:true});state.failure={path:'/api/events/drafts',status:401,body:{error:'Please log in to continue.'}};await page.goto('/events/new');await page.locator('#title').fill('Recovered after login');await page.getByRole('button',{name:'Save as Draft',exact:false}).click();await expect(page).toHaveURL(/\/login/);state.failure=null;await page.locator('#email').fill('user@example.com');await page.locator('#password').fill('Valid-password9');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#title')).toHaveValue('Recovered after login');await expect(page.getByText('Your unsaved changes were restored. Please review and save them.')).toBeVisible();
});
test('[SPM-37 Scenario 5] refresh warns without discarding unsaved input', async ({page}) => {
 await installConnectSphereMocks(page);await page.goto('/events/new');await page.locator('#title').fill('Unsaved on refresh');const dialogPromise=page.waitForEvent('dialog');const reload=page.evaluate(() => window.location.reload()).catch(()=>{});const dialog=await dialogPromise;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;await expect(page.locator('#title')).toHaveValue('Unsaved on refresh');
});

for (const [email,password,message] of [['','Valid-password9','Email is required.'],['user@example.com','','Password is required.']]) {
 test(`[SPM-32 TC-008/009] blocks the single blank field: ${message}`, async ({page}) => {
  await installLoginMock(page);await page.goto('/login');await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText(message,{exact:true})).toBeVisible();await expect(page).toHaveURL(/\/login/);
 });
}
test('[SPM-32 TC-004] attendee cannot render an organiser editor', async ({page}) => {
 await installConnectSphereMocks(page,{role:'ATTENDEE'});await page.goto('/events/new');await expect(page.getByText('This page is not available for your role.',{exact:false})).toBeVisible();await expect(page.locator('#title')).toHaveCount(0);await page.getByRole('link',{name:'Go to your dashboard'}).click();await expect(page.getByRole('heading',{name:'My Registrations',exact:true})).toBeVisible();
});
