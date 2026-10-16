// Dependency-free PNG compositing and pixel verification (Node.js built-ins only).
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function decode(path) {
  const b = fs.readFileSync(path);
  if (!b.subarray(0,8).equals(signature)) throw Error('Not PNG');
  let w,h,channels; const parts=[];
  for(let p=8;p<b.length;) {
    const n=b.readUInt32BE(p), type=b.toString('ascii',p+4,p+8), d=b.subarray(p+8,p+8+n);
    if(type==='IHDR') {
      w=d.readUInt32BE(0); h=d.readUInt32BE(4);
      if(d[8]!==8 || ![2,6].includes(d[9]) || d[12]!==0) throw Error('Unsupported PNG encoding');
      channels=d[9]===6?4:3;
    }
    if(type==='IDAT') parts.push(d);
    p+=n+12;
  }
  const raw=zlib.inflateSync(Buffer.concat(parts)), stride=w*channels, scan=Buffer.alloc(stride*h);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<h;y++) {
    const f=raw[y*(stride+1)];
    if(f>4) throw Error('Invalid filter');
    for(let x=0;x<stride;x++) {
      const i=y*stride+x, a=x>=channels?scan[i-channels]:0, b=y?scan[i-stride]:0, c=y&&x>=channels?scan[i-stride-channels]:0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][f];
      scan[i]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  const pixels=Buffer.alloc(w*h*4);
  for(let i=0;i<w*h;i++) {for(let c=0;c<3;c++) pixels[i*4+c]=scan[i*channels+c]; pixels[i*4+3]=channels===4?scan[i*4+3]:255;}
  return {w,h,pixels};
}
function crc32(b) {let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type), n=Buffer.alloc(4), crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);}
function encode({w,h,pixels},path){
  const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++)pixels.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
  fs.writeFileSync(path,Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));
}

// The delivered output holds all unchanged pixels; restore the insertion area
// from a lossless patch to avoid bundling a redundant full-size canvas.
const original=decode('artifacts/image.png'), patch=decode('source/original-area.png');
if(original.w!==3840 || original.h!==2160 || patch.w!==900 || patch.h!==600) throw Error('Unexpected source dimensions');
for(let y=0;y<600;y++) patch.pixels.copy(original.pixels,((320+y)*3840+2600)*4,y*900*4,(y+1)*900*4);
const sourcePixelSha256=crypto.createHash('sha256').update(original.pixels).digest('hex');
if(sourcePixelSha256!=='3852a2ea18bd6d71f72404ad47f17ddab746f94a992d144e3f4d2dcd0f636753') throw Error('Reconstructed original pixels differ');
const art=decode('source/miniature.png');
if(original.w!==3840 || original.h!==2160) throw Error('Unexpected source dimensions');
// This entire insertion rectangle is only 6.51% of the canvas.
const box={x:2600,y:320,width:900,height:600};
const output={...original,pixels:Buffer.from(original.pixels)};
// Remove near-white background noise, then multiply the pigment into the
// original paper. The paper texture itself is never replaced.
for(let i=0;i<art.pixels.length;i+=4)for(let c=0;c<3;c++)art.pixels[i+c]=Math.min(255,Math.round(art.pixels[i+c]*255/248));
// Area resampling in premultiplied alpha preserves fine translucent pigment.
for(let y=0;y<box.height;y++)for(let x=0;x<box.width;x++){
  const x0=x*art.w/box.width,x1=(x+1)*art.w/box.width,y0=y*art.h/box.height,y1=(y+1)*art.h/box.height;
  let a=0;const color=[0,0,0],area=(x1-x0)*(y1-y0);
  for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
    const weight=(Math.min(sx+1,x1)-Math.max(sx,x0))*(Math.min(sy+1,y1)-Math.max(sy,y0));
    const i=(sy*art.w+sx)*4,alpha=art.pixels[i+3]/255;
    a+=weight*alpha;for(let c=0;c<3;c++)color[c]+=weight*alpha*art.pixels[i+c];
  }
  a/=area;
  const i=((y+box.y)*original.w+x+box.x)*4;
  const edge=Math.min(1,x/24,y/24,(box.width-1-x)/24,(box.height-1-y)/24);
  for(let c=0;c<3;c++)output.pixels[i+c]=Math.round(original.pixels[i+c]*(1-edge*(a-color[c]/area/255)));
}
fs.mkdirSync('artifacts',{recursive:true});
encode(output,'artifacts/image.png');
const saved=decode('artifacts/image.png');
let changed=0,outsideChanged=0,minX=3840,minY=2160,maxX=-1,maxY=-1;
for(let y=0;y<2160;y++)for(let x=0;x<3840;x++){
  const i=(y*3840+x)*4;
  if(!original.pixels.subarray(i,i+4).equals(saved.pixels.subarray(i,i+4))){
    changed++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(x<box.x || x>=box.x+box.width || y<box.y || y>=box.y+box.height)outsideChanged++;
  }
}
if(outsideChanged || !changed || box.width*box.height>3840*2160*.08)throw Error('Preservation/area check failed');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report={format:'image/png',width:saved.w,height:saved.h,insertionBoundingBox:box,insertionAreaPercent:100*box.width*box.height/(3840*2160),changedPixelBoundingBox:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},changedPixels:changed,outsideChangedPixels:outsideChanged,sourceSha256:'ad271ffcbf6b7501f29d24af90c89c47deb4ba2c37fa2516615c3158fa175a99',sourcePixelSha256,originalAreaSha256:hash('source/original-area.png'),outputSha256:hash('artifacts/image.png'),miniatureSha256:hash('source/miniature.png')};
fs.writeFileSync('verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
