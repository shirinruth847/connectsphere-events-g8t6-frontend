import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_EVENT_FORM, toPayload, formValuesFromEvent, validateEventStep, eventStatusLabel, eventDisplayStatus, isDraftEvent, statusPresentation, ORGANISER_LABEL_ORDER } from '../lib/events.ts';
test('[SPM-37 Scenario 4] empty draft fields explicitly clear persisted values', () => {
 const payload = toPayload({...EMPTY_EVENT_FORM,title:'Only title'});
 for (const key of ['purpose','description','startDatetime','endDatetime','expectedAttendance','registrationCapacity']) assert.equal(payload[key],null,key);
 assert.deepEqual(payload.accessibilityNeeds,[]);
});
test('[SPM-35 AC1 / SPM-37 Scenario 4] preserve venue, layout and equipment on resume', () => {
 const event={title:'Saved',status:'DRAFT',preferredLayoutType:'THEATRE',venuePreferences:[4,2],equipmentRequirements:[{equipmentId:8,quantity:3}],accessibilityNeeds:['Custom note']};
 const payload=toPayload(formValuesFromEvent(event));
 assert.equal(payload.preferredLayoutType,'THEATRE'); assert.deepEqual(payload.venuePreferences,[4,2]);assert.deepEqual(payload.equipmentRequirements,event.equipmentRequirements);assert.deepEqual(payload.accessibilityNeeds,['Custom note']);
});
test('[SPM-35 TC-003] exactly 48 hours is valid; earlier is rejected', () => {
 const now=Date.parse('2027-01-01T10:00:00Z');const values={...EMPTY_EVENT_FORM,startDatetime:'2027-01-03T10:00:00Z',endDatetime:'2027-01-03T12:00:00Z',expectedAttendance:'1'};
 assert.deepEqual(validateEventStep(values,1,true,now),{});
 assert.match(validateEventStep({...values,startDatetime:'2027-01-03T09:59:59Z'},1,true,now).startDatetime,/48 hours/);
});
test('[SPM-35 AC2 / SPM-37 Scenario 1] drafts allow incomplete fields; Next requires them', () => {
 const values={...EMPTY_EVENT_FORM,title:'Title'};assert.deepEqual(validateEventStep(values,0,false),{});assert.ok(validateEventStep(values,0,true).purpose);assert.ok(validateEventStep(values,1,true).expectedAttendance);
});
test('[SPM-35 dashboard] use API labels and tolerate unknown states', () => {
 assert.equal(eventStatusLabel({status:'SUBMITTED',statusLabel:'Submitted'}),'Submitted');assert.ok(statusPresentation('APPROVED').border);
});
test('[Master 3.5] organiser fallbacks use the eight labels, never stored states', () => {
 const expected={DRAFT:'Draft',SUBMITTED:'Submitted',UNDER_REVIEW:'Under Review',AWAITING_CLARIFICATION:'Under Review',PLANNING:'Approved & Planning',SAFETY_REVIEW:'Approved & Planning',CONFIRMED:'Confirmed',PREPARATION:'Confirmed',COMPLETED:'Completed',REJECTED:'Rejected',CANCELLED:'Cancelled'};
 for (const [status,label] of Object.entries(expected)) {
  assert.equal(eventStatusLabel({status}),label,status);
  assert.equal(eventStatusLabel({status,statusLabel:status}),label,`${status} echoed by the API`);
 }
 assert.equal(statusPresentation('SAFETY_REVIEW').label,'Safety Review');
 assert.deepEqual(ORGANISER_LABEL_ORDER,['Draft','Submitted','Under Review','Approved & Planning','Confirmed','Completed','Cancelled','Rejected']);
});
test('[SPM-173 AC6] organiser responses without a stored status work from the label', () => {
 const expected={'Draft':'DRAFT','Submitted':'SUBMITTED','Under Review':'UNDER_REVIEW','Approved & Planning':'PLANNING','Confirmed':'CONFIRMED','Completed':'COMPLETED','Cancelled':'CANCELLED','Rejected':'REJECTED'};
 for (const [statusLabel,status] of Object.entries(expected)) {
  assert.equal(eventDisplayStatus({statusLabel}),status,statusLabel);
  assert.equal(eventStatusLabel({statusLabel}),statusLabel);
  assert.equal(isDraftEvent({statusLabel}),status==='DRAFT',statusLabel);
 }
 // Staff responses keep the stored status, which wins over the label.
 assert.equal(eventDisplayStatus({status:'SAFETY_REVIEW',statusLabel:'Approved & Planning'}),'SAFETY_REVIEW');
 assert.equal(isDraftEvent({status:'DRAFT',statusLabel:'Draft'}),true);
 // Neither recognised: shown as unknown, never treated as a draft.
 assert.equal(eventDisplayStatus({statusLabel:'Unknown status'}),'UNKNOWN');
 assert.equal(eventDisplayStatus({}),'UNKNOWN');
 assert.equal(eventStatusLabel({}),'Unknown status');
 assert.equal(isDraftEvent({}),false);
});


test('[SPM-38] support needs survive resume and are included in draft/submission payloads', () => {
 const values=formValuesFromEvent({title:'Synthetic request',technicalSupportNeeds:' AV setup '});
 assert.equal(toPayload(values).technicalSupportNeeds,'AV setup');
 assert.equal(toPayload({...EMPTY_EVENT_FORM,title:'Synthetic request'}).technicalSupportNeeds,null);
 assert.deepEqual(validateEventStep({...values,technicalSupportNeeds:'a'.repeat(2000)},4),{});
 assert.ok(validateEventStep({...values,technicalSupportNeeds:'a'.repeat(2001)},4).technicalSupportNeeds);
});
