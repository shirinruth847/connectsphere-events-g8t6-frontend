import { test, expect } from '@playwright/test';
import { installConnectSphereMocks } from './support.mjs';

const event = {eventId:71,requestId:'REQ-000071',title:'Lead integration event',status:'PLANNING',startDatetime:'2027-01-01T02:00:00Z',endDatetime:'2027-01-01T04:00:00Z',expectedAttendance:20,createdAt:'2026-10-01T00:00:00Z',coordinatorId:21,coordinatorName:'Coordinator A',supervisingLeadId:11,hasScheduleConflict:true};
const coordinators = () => [
 {coordinatorId:21,name:'Coordinator A',events:[event]},
 {coordinatorId:22,name:'Coordinator B',events:[]},
 {coordinatorId:23,name:'Busy Coordinator',events:[{...event,eventId:72,title:'Other commitment'}]},
];

for (const width of [1440, 390]) {
 test(`[SPM-180] shared keyboard focus and reassignment dialog elevation remain visible at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.assignments = [{ ...event }];
  state.coordinators = coordinators();
  await page.goto('/assignments');
  const refresh = page.getByRole('button', { name: 'Refresh assignments' });
  await expect(refresh).toBeEnabled();
  await refresh.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(refresh).toBeFocused();
  await expect(refresh).toHaveCSS('outline-style', 'solid');
  await expect.poll(() => refresh.evaluate((element) => {
   const style = getComputedStyle(element);
   const luminance = (color) => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255);
    return channels.reduce((total, value, index) => total + [0.2126, 0.7152, 0.0722][index]
      * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), 0);
   };
   const values = [luminance(style.outlineColor), luminance(style.backgroundColor)].sort((a, b) => a - b);
   return (values[1] + 0.05) / (values[0] + 0.05);
  })).toBeGreaterThanOrEqual(3);
  await page.getByRole('combobox').selectOption('22');
  await page.getByRole('button', { name: 'Reassign coordinator', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toHaveCSS('box-shadow', 'none');
  expect(state.coordinatorChanges).toHaveLength(0);
 });
}

test('[SPM-174] Lead confirms an initial assignment and the request leaves the queue',async({page})=>{
 const state=await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});
 state.coordinators=coordinators();state.queueEvents=[{...event,status:'SUBMITTED',coordinatorId:undefined}];state.delay=300;
 await page.goto('/events');
 const card=page.getByRole('article').filter({hasText:event.title});
 await card.getByRole('button',{name:'Assign coordinator',exact:true}).click();
 await page.getByRole('radio',{name:'Select coordinator Coordinator B'}).check();
 await page.getByRole('button',{name:'Confirm assignment'}).click();
 await expect(card).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText('REQ-000071 assigned to Coordinator B');
 expect(state.coordinatorChanges).toEqual([{coordinatorId:22}]);
 await page.goto('/assignments');
 await expect(page.getByRole('article',{name:event.title})).toContainText('Coordinator B');
});

test('[SPM-174] Lead resolves a conflict, with busy targets disabled and an explicit confirmation',async({page})=>{
 const state=await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});state.assignments=[{...event}];state.coordinators=coordinators();
 await page.goto('/assignments');
 const card=page.getByRole('article',{name:event.title});
 await expect(card).toContainText('overlapping active event');
 await expect(card.getByRole('option',{name:'Busy Coordinator — schedule conflict'})).toBeDisabled();
 await card.getByRole('combobox').selectOption('22');
 await card.getByRole('button',{name:'Reassign coordinator',exact:true}).click();
 expect(state.coordinatorChanges).toHaveLength(0);
 await page.getByRole('button',{name:'Confirm assignment'}).click();
 await expect(card).toContainText('Current coordinator: Coordinator B');
 await expect(card).not.toContainText('overlapping active event');
 expect(state.coordinatorChanges).toEqual([{coordinatorId:22,expectedCoordinatorId:21}]);
});

test('[SPM-174] rejected or stale reassignment keeps the current coordinator and requires refresh',async({page})=>{
 const state=await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});state.assignments=[{...event}];state.coordinators=coordinators();
 state.failure={path:'/api/events/71/coordinator',status:409,body:{error:'Assignment changed. Refresh and try again.',code:'ASSIGNMENT_CHANGED'}};
 await page.goto('/assignments');
 const card=page.getByRole('article',{name:event.title});
 await card.getByRole('combobox').selectOption('22');await card.getByRole('button',{name:'Reassign coordinator',exact:true}).click();await page.getByRole('button',{name:'Confirm assignment'}).click();
 await expect(card.getByRole('alert')).toContainText('Assignment changed');
 await expect(card).toContainText('Current coordinator: Coordinator A');
 await expect(card.getByRole('button',{name:'Reassign coordinator',exact:true})).toBeDisabled();
 await expect(page.getByText('Coordinator updated for REQ-000071.')).toHaveCount(0);
 state.failure=null;
 await card.getByRole('button',{name:'Refresh availability'}).click();
 await expect(card.getByRole('combobox')).toHaveValue('');
});

test('[SPM-174] non-Leads cannot open assignment controls',async({page})=>{
 const state=await installConnectSphereMocks(page,{role:'ORGANISER'});
 await page.goto('/assignments');await expect(page.getByText('Access denied',{exact:true})).toBeVisible();
 expect(state.requestLog.filter(r=>r.pathname==='/api/events/assignments')).toHaveLength(0);
});

test('[SPM-174] month navigation visits November from October 31 and February from March 31',async({page})=>{
 await installConnectSphereMocks(page,{role:'COORDINATOR_LEAD'});
 await page.goto('/calendar');await expect(page.locator('.calendar-title')).toBeVisible();
 await page.clock.setFixedTime(new Date('2026-10-31T04:00:00Z'));
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await expect(page.locator('.calendar-title')).toHaveText('October 2026');
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.calendar-title')).toHaveText('November 2026');
 await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.locator('.calendar-title')).toHaveText('October 2026');
 await page.clock.setFixedTime(new Date('2027-03-31T04:00:00Z'));
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await page.getByRole('button',{name:'Previous',exact:true}).click();
 await expect(page.locator('.calendar-title')).toHaveText('February 2027');
});
