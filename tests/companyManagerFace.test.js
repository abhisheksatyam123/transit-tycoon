import { describe, test, expect } from 'bun:test';
import { setCompanyManagerFace, presidentFaceId, MAX_PRESIDENT_FACE_ID } from '../js/simulation/cmdRename.js';
import { Game } from '../js/simulation/game.js';
import { ISSUE_COMMANDS } from '../js/ui/app.js';
function ctx(){ return { state:{ company:{} } }; }
describe('company manager face',()=>{
 test('sets presidentFaceId',()=>{ const c=ctx(); const r=setCompanyManagerFace(c,5); expect(r.ok).toBe(true); expect(c.state.company.presidentFaceId).toBe(5); expect(presidentFaceId(c.state)).toBe(5); });
 test('0 removes lazy',()=>{ const c=ctx(); setCompanyManagerFace(c,3); setCompanyManagerFace(c,0); expect('presidentFaceId' in c.state.company).toBe(false); expect(presidentFaceId(c.state)).toBe(0); });
 test('out of range',()=>{ const c=ctx(); expect(setCompanyManagerFace(c,16).ok).toBe(false); expect(setCompanyManagerFace(c,-1).ok).toBe(false); expect(MAX_PRESIDENT_FACE_ID).toBe(15); });
 test('dryRun',()=>{ const c=ctx(); const r=setCompanyManagerFace(c,7,{dryRun:true}); expect(r).toEqual({ok:true,cost:0,faceId:7}); expect('presidentFaceId' in c.state.company).toBe(false); });
 test('default 0',()=>{ expect(presidentFaceId({})).toBe(0); expect(presidentFaceId(null)).toBe(0); expect(presidentFaceId({company:{}})).toBe(0); });
 test('game + ISSUE',()=>{ const g=Game.create({seed:1}); const r=g.setCompanyManagerFace(9); expect(r.ok).toBe(true); expect(g.state.company.presidentFaceId).toBe(9); expect(ISSUE_COMMANDS).toContain('setCompanyManagerFace'); g.setCompanyManagerFace(0); expect('presidentFaceId' in g.state.company).toBe(false); });
});
