import { TITLE_SCENES } from './title-scene-data.js';

export function createTitleScene(kind) {
  if (!TITLE_SCENES[kind]) throw new Error(`Unknown title scene: ${kind}`);
  return {kind,ticks:0,phase:0,spaceHeld:0,startedAt:0,now:0,removed:false,
    palette:kind === 'opening' ? TITLE_SCENES.opening.palettes[0] : TITLE_SCENES.gameover.palette,render:[]};
}

export function stepTitleScene(scene,input,now) {
  const effects={sounds:[],cd:[],requests:[],palettes:[]};
  scene.render=[];
  if(scene.removed) return effects;
  const finish=()=>{scene.removed=true;effects.requests.push({target:'main',stage:0});};
  if(scene.kind==='opening') {
    if(scene.ticks===0) {
      scene.palette=TITLE_SCENES.opening.palettes[scene.phase];effects.palettes.push(scene.palette);
    }
    if(++scene.ticks===100) {scene.ticks=0;if(++scene.phase===2){finish();return effects;}}
    // The second logo is drawn once with the first palette before its palette is installed.
    scene.render.push({name:TITLE_SCENES.opening.images[scene.phase],x:0,y:0});
  } else {
    if(!scene.ticks) {effects.cd.push('play cdaudio from 14 to 15');scene.startedAt=now;}
    if(input.space) scene.spaceHeld=1;
    scene.now=now;
    if(((now-scene.startedAt)>>>0)>14000 || scene.spaceHeld && !input.space) {
      scene.spaceHeld=0;finish();return effects;
    }
    scene.render.push({name:TITLE_SCENES.gameover.image,x:0,y:0});scene.ticks++;
  }
  return effects;
}
