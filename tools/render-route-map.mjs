// Deterministic diagnostic picture of the original collision mask and object placements.
import {readFileSync,writeFileSync} from 'node:fs';
import {sample,definitions} from './route-stage1.mjs';
const [x0,x1,y0,y1]=process.argv.slice(2,6).map(Number),scale=4,w=Math.ceil((x1-x0)/scale),h=Math.ceil((y1-y0)/scale),pixels=Buffer.alloc(w*h*3,245);
const colors=[[245,245,240],[65,70,95],[55,150,190],[200,135,60],[180,90,155],[235,35,40]];
const dot=(x,y,color)=>{if(x>=0&&y>=0&&x<w&&y<h)for(let c=0;c<3;c++)pixels[(y*w+x)*3+c]=color[c];};
for(let y=0;y<h;y++)for(let x=0;x<w;x++)dot(x,y,colors[sample(x0+x*scale,y0+y*scale)]??colors[0]);
const digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
const text=(s,x,y,color)=>{for(const ch of String(s)){const glyph=digits[+ch];if(glyph)for(let dy=0;dy<5;dy++)for(let dx=0;dx<3;dx++)if(glyph[dy*3+dx]==='1')dot(x+dx,y+dy,color);x+=4;}};
for(let x=Math.ceil(x0/500)*500;x<x1;x+=500){const sx=Math.floor((x-x0)/scale);for(let y=0;y<h;y+=3)dot(sx,y,[160,160,160]);text(x,sx+2,2,[0,0,0]);}
for(let y=Math.ceil(y0/250)*250;y<y1;y+=250){const sy=Math.floor((y-y0)/scale);for(let x=0;x<w;x+=3)dot(x,sy,[160,160,160]);text(y,2,sy+2,[0,0,0]);}
for(const o of definitions){
 if(o.x+o.width<x0||o.x>x1||o.y+o.height<y0||o.y>y1)continue;
 if(![0,1,2,3,4,5,9,11,12,18,49,50,88,123,124].includes(o.kind))continue;
 const x=Math.floor((o.x-x0)/scale),y=Math.floor((o.y-y0)/scale),ow=Math.ceil(o.width/scale),oh=Math.ceil(o.height/scale);
 const c=[9,88].includes(o.kind)?[0,180,0]:[11,12].includes(o.kind)?[180,0,220]:[3,4,5,49,50].includes(o.kind)?[0,80,255]:[240,100,0];
 for(let dx=0;dx<ow;dx++){dot(x+dx,y,c);dot(x+dx,y+oh,c);}for(let dy=0;dy<oh;dy++){dot(x,y+dy,c);dot(x+ow,y+dy,c);}text(o.kind,x,y-6,c);
}
try{const trace=JSON.parse(readFileSync('/tmp/changoo-stage1-candidate.json')).web;for(const p of trace){const x=Math.floor((p.x+38-x0)/scale),y=Math.floor((p.y+71-y0)/scale);dot(x,y,[30,190,130]);}}catch{}
writeFileSync('/tmp/changoo-route-map.ppm',Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),pixels]));
