// Analysis-only route discovery. The delivered game never runs this driver.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readArchive,decodeMap,decodeImage} from '../web/resources.js';
import {createPlayer,collisionAt,supported} from '../web/game.js';
import {createWorld,restartWorld,initializeWorldCamera,advanceWorldCamera,cameraActive,readStageObjects,stepWorld} from '../web/objects.js';
import {createStageEntry} from '../web/stage-entry.js';
import {cameraMode,resetCameraOrigin} from '../web/camera.js';
export const archive=readArchive(readFileSync(new URL('../Changoo (E)/RESOURCE.RES',import.meta.url)));
export const map=decodeMap(archive.get('stage1.map')),mask=decodeImage(archive.get('block1.app'));
export const definitions=readStageObjects(map,readFileSync(new URL('../Changoo (E)/RESOURCE/CHAR.CFG',import.meta.url)),archive);
export const sample=(x,y)=>collisionAt(map,mask,x,y);
export function start(){
  const run={p:createPlayer(0,0),camera:{x:0,y:0,scrollMode:0},world:createWorld(definitions,map),tick:0,now:1000,inputs:[],web:[]};
  run.p.moveEnabled=false;run.world.stageEntry=createStageEntry(1,1000);
  initializeWorldCamera(run.world,run.p,run.camera,1000);return run;
}
export function step(run,input){
  run.now=1000+Math.floor(++run.tick*1000/60);
  run.camera.scrollMode=cameraMode(run.p,run.world.event,0);
  if(cameraActive(run.world))advanceWorldCamera(run.world,run.p,run.camera,1,run.now);
  stepWorld(run.world,run.p,input,run.camera,sample,run.now);
  run.inputs.push(input);
  run.web.push({x:run.p.x,y:run.p.y,state:run.p.state,lives:run.p.lives,points:run.p.points,cameraX:run.camera.x,cameraY:run.camera.y,event:run.world.event?.kind??null,mini:run.world.minigame&&!run.world.minigame.finished?run.world.minigame.kind:null});
  if(run.p.respawnRequested){run.world=restartWorld(run.world,definitions);resetCameraOrigin(run.camera);run.p.respawnRequested=false;initializeWorldCamera(run.world,run.p,run.camera,run.now);}
}
export function commonInput(run){
  if(run.world.stageEntry&&!run.world.stageEntry.finished)return {fire:true};
  if(run.world.event)return {enter:run.world.event.skippable!==false&&!run.world.event.enterHeld};
  if(run.world.inventory&&!run.world.inventory.removed)return {enter:!run.world.inventory.enterHeld};
  if(run.world.minigame&&!run.world.minigame.finished)return run.world.minigame.kind==='mole'?{exit:true}:{};
  return null;
}
function fork(run){
  const world=structuredClone({...run.world,map:null});world.map=map;
  return {p:structuredClone(run.p),camera:structuredClone(run.camera),world,tick:run.tick,now:run.now,inputs:[],web:[]};
}
const steer=(p,x)=>({right:x-p.x>8,left:x-p.x< -8});
function platformAt(run,y){return run.world.surfaces.find(s=>s.active&&!s.removed&&s.y===y&&s.x>9000&&s.x<10300);}
function jumpPlan(run,y){
  if(!run.p.onPlatform||run.p.jumpHeld||run.p.vy<0)return null;
  const trial=fork(run);
  for(let i=0;i<60;i++){
    const target=platformAt(trial,y);if(!target)return null;
    step(trial,{...steer(trial.p,target.x-7),jump:i===0});
    if(trial.p.dead||trial.p.hazard||trial.p.lives<run.p.lives||trial.p.x<9000)return null;
    if(trial.p.onPlatform&&Math.abs(trial.p.y-(target.y-70))<=1&&trial.p.vy>=0)return trial.inputs;
  }
  return null;
}
function exitPlan(run){
  if(!run.p.onPlatform)return null;
  const trial=fork(run);
  for(let i=0;i<80;i++){
    step(trial,{right:true});
    if(trial.p.dead||trial.p.hazard||trial.p.lives<run.p.lives)return null;
    if(trial.p.x>10200)return trial.inputs;
  }
  return null;
}
export function forwardInput(run,stalled){
  const p=run.p;
  if(p.x<100){run.firstPillarDone=false;run.secondPitDone=false;run.thirdPitDone=false;run.springExit=0;run.platformPhase=0;run.planned=[];}
  if(run.planned?.length)return run.planned.shift();
  if(p.x>9260&&p.x<9400&&!run.firstPillarDone){
    if(p.y>=2900&&(p.onPlatform||supported(p.x,p.y+4,sample)))run.firstPillarDone=true;
    else return {};
  }
  if(!run.platformPhase&&p.onPlatform&&Math.abs(p.y-2777)<=1)run.platformPhase=1;
  if(run.platformPhase===1){
    const plan=jumpPlan(run,2725);
    if(plan){run.planned=plan;run.platformPhase=2;return run.planned.shift();}
    const platform=platformAt(run,2847);
    if(platform)return steer(p,platform.x-7);
  }
  if(run.platformPhase===2){
    const plan=exitPlan(run);
    if(plan){run.planned=plan;run.platformPhase=3;return run.planned.shift();}
    const platform=platformAt(run,2725);
    if(platform)return steer(p,platform.x-7);
  }
  if(p.x>13560&&p.x<13680&&p.y>2000&&!run.secondPitDone){
    if(p.y>=2500&&(p.onPlatform||supported(p.x,p.y+4,sample)))run.secondPitDone=true;
    else return {};
  }
  if(p.x>14020&&p.x<14130&&p.y>2400&&!run.thirdPitDone){
    if(p.y>=2600&&(p.onPlatform||supported(p.x,p.y+4,sample)))run.thirdPitDone=true;
    else return {};
  }
  if(!run.springExit&&p.x>14260&&p.x<14350&&p.vy>0&&p.y>2300)run.springExit=1;
  if(run.springExit===1){
    if(p.x>14210)return {left:true};
    run.springExit=2;
  }
  if(run.springExit===2){
    if(p.y>=2580&&supported(p.x,p.y+4,sample))run.springExit=3;
    else return {};
  }
  if(run.springExit===3){
    if(p.x<14385)return {right:true};
    run.springExit=4;
  }
  if(p.x>24500){const dx=24743-p.x;return {right:dx>20,left:dx< -20,jump:['idle','walk'].includes(p.state)&&!p.jumpHeld};}
  return {right:true,jump:!p.jumpHeld&&(p.onPlatform||supported(p.x,p.y+4,sample)),fire:p.state==='chickenAir'&&stalled>3&&run.tick%2===0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const run=start();let stalled=0,lastX=0,lastKey='',maxX=0;
  for(let i=0;i<20000&&!run.p.dead&&!run.world.stageComplete;i++){
    const input=commonInput(run)??forwardInput(run,stalled);step(run,input);
    stalled=run.p.x===lastX?stalled+1:0;lastX=run.p.x;maxX=Math.max(maxX,lastX);
    const key=`${run.p.lives}/${run.world.event?.kind}/${run.world.minigame?.kind}/${run.platformPhase}/${run.p.state.startsWith('chicken')?'chicken':run.p.state.startsWith('roach')?'roach':'normal'}`;
    if(key!==lastKey||run.tick%500===0){console.log(run.tick,run.p.x,run.p.y,run.p.state,'lives',run.p.lives,'points',run.p.points,'event',run.world.event?.kind,'mini',run.world.minigame?.kind,'stalled',stalled);lastKey=key;}
    if(stalled>900&&!commonInput(run)){console.log('STALLED');break;}
  }
  const output={source:'WEB candidate only, requires native replay',tick:run.tick,maxX,complete:run.world.stageComplete,player:run.p,inputs:run.inputs,web:run.web};
  writeFileSync('/tmp/changoo-stage1-candidate.json',JSON.stringify(output));
  console.log('result',run.tick,maxX,run.world.stageComplete,run.p.lives);
}
